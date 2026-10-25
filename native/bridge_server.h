#pragma once

#include <QJsonArray>
#include <QJsonObject>
#include <QLocalServer>
#include <QLocalSocket>
#include <QObject>
#include <QPointer>
#include <QSet>
#include <QTimer>
#include <functional>

// Prototype protocol: real native observation and read-only preflight.
// No load/set/play API exists here: the Mixxx asynchronous commit is NOT safe yet.
class CopilotBridgeServer final : public QObject {
  public:
    using Snapshot = std::function<QJsonArray()>;
    CopilotBridgeServer(QString directory, QString musicRoot, QString provider,
            Snapshot snapshot, QObject* parent = nullptr);
    ~CopilotBridgeServer() override;
    bool start(QString* error);

  private:
    void accept();
    void read(QLocalSocket* socket);
    void message(QLocalSocket* socket, const QJsonObject& request);
    void send(QLocalSocket* socket, const QJsonObject& object);
    void reply(QLocalSocket* socket, const QString& id, bool ok,
            const QString& code, const QString& detail, QJsonObject value = {});
    void tick();
    void revoke();
    bool expected(const QJsonObject& payload, const QJsonArray& decks) const;
    QString m_directory, m_musicRoot, m_provider, m_token, m_session;
    Snapshot m_snapshot;
    QLocalServer m_server;
    QTimer m_timer;
    QPointer<QLocalSocket> m_client;
    QSet<QString> m_seen;
    quint64 m_sequence = 0;
    qint64 m_lastRequest = 0, m_authorizedUntil = 0;
    int m_authorizedDeck = 0;
    QJsonArray m_authorizedRevisions;
    bool m_ownsEndpoint = false;
};
