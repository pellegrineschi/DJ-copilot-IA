#include "bridge_server.h"

#include <QDateTime>
#include <QDir>
#include <QFileInfo>
#include <QJsonDocument>
#include <QJsonParseError>
#include <QRandomGenerator>
#include <QRegularExpression>
#include <QUuid>
#include <cmath>
#include <fcntl.h>
#include <sys/stat.h>
#include <sys/socket.h>
#include <unistd.h>

namespace {
constexpr int kFrameLimit = 65536;
qint64 now() { return QDateTime::currentMSecsSinceEpoch(); }
bool privateDirectory(const QString& path) {
    struct stat info{};
    const auto bytes = QFile::encodeName(path);
    return ::lstat(bytes.constData(), &info) == 0 && S_ISDIR(info.st_mode) &&
            info.st_uid == ::getuid() && (info.st_mode & 0777) == 0700 &&
            QFileInfo(path).canonicalFilePath() == path;
}
bool exactKeys(const QJsonObject& object, const QStringList& keys) {
    for (auto it = object.begin(); it != object.end(); ++it)
        if (!keys.contains(it.key())) return false;
    return true;
}
QJsonArray revisions(const QJsonArray& decks) {
    QJsonArray result;
    for (const auto& deck : decks) result.append(deck.toObject().value("revision"));
    return result;
}
const QRegularExpression kId(QStringLiteral("^[a-zA-Z0-9-]{1,64}$"));
}

CopilotBridgeServer::CopilotBridgeServer(QString directory, QString musicRoot,
        QString provider, Snapshot snapshot, QObject* parent)
        : QObject(parent), m_directory(std::move(directory)),
          m_musicRoot(QFileInfo(musicRoot).canonicalFilePath()),
          m_provider(std::move(provider)), m_snapshot(std::move(snapshot)) {
    connect(&m_server, &QLocalServer::newConnection, this, [this] { accept(); });
    connect(&m_timer, &QTimer::timeout, this, [this] { tick(); });
}

bool CopilotBridgeServer::start(QString* error) {
    if (!privateDirectory(m_directory) || m_directory.toUtf8().size() > 85) {
        *error = "Directorio IPC debe ser canónico, privado (0700), del usuario y de ruta corta.";
        return false;
    }
    if (m_musicRoot.isEmpty() || !QFileInfo(m_musicRoot).isDir()) {
        *error = "La raíz de música debe ser un directorio existente.";
        return false;
    }
    // Only a filesystem Unix socket. No abstract/public socket and no stale unlink.
    m_server.setSocketOptions(QLocalServer::UserAccessOption);
    m_server.setMaxPendingConnections(4);
    if (!m_server.listen(m_directory + "/bridge.sock")) {
        *error = m_server.errorString(); return false;
    }
    const auto tokenPath = QFile::encodeName(m_directory + "/token");
    const int fd = ::open(tokenPath.constData(), O_CREAT | O_EXCL | O_WRONLY | O_NOFOLLOW | O_CLOEXEC, 0600);
    if (fd < 0) { *error = "No se puede crear un token nuevo; usá una sesión IPC vacía."; m_server.close(); return false; }
    QByteArray random;
    for (int i = 0; i < 8; ++i) {
        const quint32 value = QRandomGenerator::system()->generate();
        random.append(reinterpret_cast<const char*>(&value), sizeof(value));
    }
    m_token = QString::fromLatin1(random.toHex());
    const auto token = m_token.toLatin1();
    const auto written = ::write(fd, token.constData(), token.size());
    ::close(fd);
    m_ownsEndpoint = true;
    if (written != token.size()) { *error = "No se pudo guardar el token IPC."; m_server.close(); return false; }
    m_timer.start(250);
    return true;
}

CopilotBridgeServer::~CopilotBridgeServer() {
    m_timer.stop();
    if (m_client) { m_client->disconnect(this); m_client->abort(); }
    m_server.close();
    if (m_ownsEndpoint) QFile::remove(m_directory + "/token");
}

void CopilotBridgeServer::accept() {
    while (m_server.hasPendingConnections()) {
        auto* socket = m_server.nextPendingConnection();
        struct ucred peer{}; socklen_t length = sizeof(peer);
        if (::getsockopt(socket->socketDescriptor(), SOL_SOCKET, SO_PEERCRED, &peer, &length) != 0 ||
                peer.uid != ::getuid() || m_client || findChildren<QLocalSocket*>().size() >= 4) {
            socket->abort(); socket->deleteLater(); continue;
        }
        socket->setParent(this);
        socket->setReadBufferSize(kFrameLimit + 1);
        connect(socket, &QLocalSocket::readyRead, this, [this, socket] { read(socket); });
        connect(socket, &QLocalSocket::disconnected, this, [this, socket] {
            if (m_client == socket) { m_client.clear(); revoke(); m_session.clear(); m_seen.clear(); }
            socket->deleteLater();
        });
        QTimer::singleShot(3000, socket, [this, socket] { if (m_client != socket) socket->abort(); });
    }
}

void CopilotBridgeServer::send(QLocalSocket* socket, const QJsonObject& object) {
    if (!socket || socket->state() != QLocalSocket::ConnectedState) return;
    if (socket->bytesToWrite() > 4 * kFrameLimit) { socket->abort(); return; }
    socket->write(QJsonDocument(object).toJson(QJsonDocument::Compact) + '\n');
}
void CopilotBridgeServer::reply(QLocalSocket* socket, const QString& id, bool ok,
        const QString& code, const QString& detail, QJsonObject value) {
    send(socket, {{"type", "reply"}, {"id", id}, {"session", m_session},
            {"ok", ok}, {"code", code}, {"message", detail}, {"value", value}});
}
void CopilotBridgeServer::read(QLocalSocket* socket) {
    while (socket->canReadLine()) {
        const auto line = socket->readLine(kFrameLimit + 1);
        QJsonParseError error;
        const auto document = QJsonDocument::fromJson(line, &error);
        if (line.size() > kFrameLimit || !line.endsWith('\n') || error.error != QJsonParseError::NoError || !document.isObject()) {
            socket->abort(); return;
        }
        message(socket, document.object());
        if (socket->state() != QLocalSocket::ConnectedState) return;
    }
    if (socket->bytesAvailable() >= kFrameLimit) socket->abort();
}
void CopilotBridgeServer::revoke() {
    m_authorizedDeck = 0; m_authorizedUntil = 0; m_authorizedRevisions = {};
}
bool CopilotBridgeServer::expected(const QJsonObject& payload, const QJsonArray& decks) const {
    return decks.size() == 2 && payload.value("revisions").isArray() &&
            payload.value("revisions").toArray() == revisions(decks) &&
            decks[0].toObject().value("available").toBool() && decks[1].toObject().value("available").toBool();
}
void CopilotBridgeServer::tick() {
    if (!m_client) return;
    if (now() - m_lastRequest > 3000 || now() < m_lastRequest) { m_client->abort(); return; }
    const auto decks = m_snapshot();
    if (m_authorizedDeck && (now() > m_authorizedUntil || revisions(decks) != m_authorizedRevisions)) revoke();
    send(m_client, {{"type", "state"}, {"session", m_session},
            {"sequence", static_cast<double>(++m_sequence)}, {"sentAt", static_cast<double>(now())},
            {"decks", decks}, {"authorizedDeck", m_authorizedDeck},
            {"authorizedUntil", static_cast<double>(m_authorizedUntil)}});
}
void CopilotBridgeServer::message(QLocalSocket* socket, const QJsonObject& request) {
    const auto id = request.value("id").toString();
    if (!kId.match(id).hasMatch()) { socket->abort(); return; }
    if (m_client != socket) {
        if (m_client || !exactKeys(request, {"id", "type", "protocol", "token"}) ||
                request.value("type") != "hello" || request.value("protocol") != 1 ||
                request.value("token").toString() != m_token) { socket->abort(); return; }
        m_client = socket; m_session = QUuid::createUuid().toString(QUuid::WithoutBraces);
        m_seen.clear(); m_sequence = 0; m_lastRequest = now(); revoke();
        reply(socket, id, true, "HELLO", "Puente nativo: observación y comprobación; carga deshabilitada.",
                {{"protocol", 1}, {"provider", m_provider}, {"build", "copilot-2.5.6-observer-1"},
                 {"capabilities", QJsonObject{{"trackIdentity", true}, {"loadByPath", false}, {"tempo", false}, {"cue", false}, {"preflight", true}}}});
        tick(); return;
    }
    if (!exactKeys(request, {"id", "type", "session", "command", "payload"}) ||
            request.value("type") != "request" || request.value("session") != m_session ||
            !request.value("payload").isObject()) { socket->abort(); return; }
    m_lastRequest = now();
    if (m_seen.contains(id)) { reply(socket, id, false, "DUPLICATE", "ID de operación repetido; no se reejecutó."); return; }
    if (m_seen.size() >= 4096) { socket->abort(); return; }
    // Heartbeats do not occupy the operation deduplication set.
    const auto command = request.value("command").toString();
    if (command != "ping") m_seen.insert(id);
    const auto payload = request.value("payload").toObject();
    if (command == "ping" && payload.isEmpty()) { reply(socket, id, true, "PONG", "Conexión vigente."); return; }
    if ((command == "cancel" || command == "reserve") && payload.isEmpty()) {
        revoke(); reply(socket, id, true, "CANCELLED", "Autorización descartada. Ninguna carga en cola."); tick(); return;
    }
    if (command == "prepare" || command == "load" || command == "tempo" || command == "cue") {
        reply(socket, id, false, "ATOMIC_LOAD_UNAVAILABLE",
                "Carga deshabilitada: falta el commit atómico cancelable dentro del motor de Mixxx. No se modificó ningún control."); return;
    }
    const auto decks = m_snapshot();
    if (command == "authorize") {
        if (!exactKeys(payload, {"deckId", "revisions", "replace"}) || !expected(payload, decks) ||
                !payload.value("replace").isBool() || (payload.value("deckId") != 1 && payload.value("deckId") != 2)) {
            reply(socket, id, false, "CONFLICT", "Datos de autorización inválidos o decks cambiados."); return;
        }
        const int target = payload.value("deckId").toInt();
        const auto deck = decks[target - 1].toObject();
        if (deck.value("playing").toBool() || deck.value("loading").toBool() ||
                (deck.value("loaded").toBool() && !payload.value("replace").toBool())) {
            reply(socket, id, false, "OCCUPIED", "Deck activo, cargando u ocupado sin permiso explícito."); return;
        }
        m_authorizedDeck = target; m_authorizedUntil = now() + 10000; m_authorizedRevisions = revisions(decks);
        reply(socket, id, true, "AUTHORIZED_PREFLIGHT", "Autorizado para comprobar durante 10 s. Carga real deshabilitada."); tick(); return;
    }
    if (command == "inspect") {
        if (!exactKeys(payload, {"deckId", "revisions", "path"}) || !expected(payload, decks) ||
                payload.value("deckId") != m_authorizedDeck || !m_authorizedDeck ||
                now() > m_authorizedUntil || revisions(decks) != m_authorizedRevisions) {
            revoke(); reply(socket, id, false, "CONFLICT", "Falta autorización vigente o cambió algún deck."); return;
        }
        const int target = m_authorizedDeck; revoke(); // Single-use, including failures.
        const auto path = payload.value("path").toString();
        const QFileInfo file(path);
        const auto canonical = file.canonicalFilePath();
        const auto targetDeck = decks[target - 1].toObject();
        const auto sourceDeck = decks[2 - target].toObject();
        if (targetDeck.value("playing").toBool() || targetDeck.value("loading").toBool() ||
                !sourceDeck.value("playing").toBool() || sourceDeck.value("loading").toBool()) {
            reply(socket, id, false, "UNSAFE", "Se necesita un único deck activo y el destino detenido."); return;
        }
        if (path.size() > 4096 || path.contains(QChar(0)) || !file.isAbsolute() ||
                canonical != path || !file.isFile() || !file.isReadable() ||
                file.suffix().compare("mp3", Qt::CaseInsensitive) != 0 ||
                !canonical.startsWith(m_musicRoot + "/")) {
            reply(socket, id, false, "INVALID_PATH", "Se requiere MP3 existente, legible y canónico dentro de la raíz de música autorizada."); return;
        }
        reply(socket, id, true, "PREFLIGHT_ONLY", "Archivo y estados comprobados. No se cargó ni preparó una canción.",
                {{"path", canonical}, {"bytes", static_cast<double>(file.size())}, {"deckId", target}, {"loaded", false}, {"prepared", false}});
        tick(); return;
    }
    reply(socket, id, false, "UNKNOWN_COMMAND", "Comando no admitido.");
}
