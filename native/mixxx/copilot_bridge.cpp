// Mixxx 2.5.6 integration. This translation unit performs ZERO control writes.
#include "copilot_bridge.h"
#include "bridge_server.h"

#include <QFileInfo>
#include <QJsonArray>
#include <QJsonObject>
#include <QPointer>
#include <QTimer>
#include <QtDebug>
#include <array>
#include "control/controlobject.h"
#include "mixer/basetrackplayer.h"
#include "mixer/playermanager.h"
#include "track/track.h"

namespace {
class MixxxView final : public QObject {
  public:
    explicit MixxxView(PlayerManager* players) : QObject(players), m_players(players) {}
    QJsonArray snapshot() {
        QJsonArray decks;
        for (int i = 0; i < 2; ++i) {
            const auto group = QStringLiteral("[Channel%1]").arg(i + 1);
            auto* player = m_players->getPlayer(group);
            if (player && m_bound[i] != player) {
                m_bound[i] = player; m_confirmed[i].reset(); m_loading[i] = false; m_ambiguous[i] = false; ++m_revision[i];
                connect(player, &BaseTrackPlayer::loadingTrack, this, [this, i](TrackPointer, TrackPointer) {
                    // Mixxx 2.5.6 has no operation IDs and warns about overlapping
                    // loads. Quarantine identity until an explicit unload completes.
                    if (m_loading[i]) m_ambiguous[i] = true;
                    m_confirmed[i].reset(); m_loading[i] = true; ++m_revision[i];
                });
                connect(player, &BaseTrackPlayer::newTrackLoaded, this, [this, i](TrackPointer track) {
                    if (!m_ambiguous[i]) m_confirmed[i] = track;
                    m_loading[i] = false; ++m_revision[i];
                });
                connect(player, &BaseTrackPlayer::playerEmpty, this, [this, i] {
                    m_confirmed[i].reset(); m_loading[i] = false; m_ambiguous[i] = false; ++m_revision[i];
                });
                connect(player, &QObject::destroyed, this, [this, i] {
                    m_bound[i].clear(); m_confirmed[i].reset(); m_loading[i] = false; ++m_revision[i];
                });
            }
            const auto control = [&](const QString& key) { return ControlObject::getControl(ConfigKey(group, key)); };
            const auto value = [&](const QString& key) { const auto* c = control(key); return c ? c->get() : 0.0; };
            const bool available = player && control("play") && control("track_loaded");
            const bool playing = value("play") > 0;
            const bool loaded = value("track_loaded") > 0;
            const double duration = value("duration");
            const double position = value("playposition") * duration;
            const double samples = value("track_samples");
            const double cue = value("cue_point");
            // Only the success signal is identity evidence. getLoadedTrack() alone
            // can already refer to a candidate still being decoded by a worker.
            auto confirmed = m_confirmed[i];
            if (!player || !loaded || m_loading[i] || player->getLoadedTrack() != confirmed) confirmed.reset();
            const auto path = confirmed ? QFileInfo(confirmed->getLocation()).canonicalFilePath() : QString();
            const QJsonObject signature{{"play", playing}, {"loaded", loaded}, {"loading", m_loading[i]},
                {"rate", value("rate_ratio")}, {"cue", cue}, {"sync", value("sync_mode")},
                {"scratch", value("scratch2_enable")}, {"position", playing ? 0 : position}};
            if (signature != m_signature[i]) { m_signature[i] = signature; ++m_revision[i]; }
            decks.append(QJsonObject{{"id", i + 1}, {"available", available},
                {"revision", static_cast<double>(m_revision[i])}, {"loaded", loaded}, {"playing", playing},
                {"loading", m_loading[i]}, {"path", path.isEmpty() ? QJsonValue() : QJsonValue(path)},
                {"title", confirmed ? confirmed->getTitle() : QString()},
                {"artist", confirmed ? confirmed->getArtist() : QString()},
                {"bpm", loaded && value("bpm") > 0 ? QJsonValue(value("bpm")) : QJsonValue()},
                {"originalBpm", loaded && value("file_bpm") > 0 ? QJsonValue(value("file_bpm")) : QJsonValue()},
                {"duration", loaded && duration > 0 ? QJsonValue(duration) : QJsonValue()},
                {"positionSeconds", loaded ? position : 0.0}, {"tempoRatio", value("rate_ratio")},
                {"cueSeconds", loaded && samples > 0 && cue >= 0 && cue < samples ? QJsonValue(cue / samples * duration) : QJsonValue()}});
        }
        return decks;
    }
  private:
    PlayerManager* m_players;
    std::array<QPointer<BaseTrackPlayer>, 2> m_bound;
    std::array<TrackPointer, 2> m_confirmed;
    std::array<bool, 2> m_loading{};
    std::array<bool, 2> m_ambiguous{};
    std::array<quint64, 2> m_revision{};
    std::array<QJsonObject, 2> m_signature;
};
}

void startCopilotBridge(PlayerManager* players) {
    const auto directory = qEnvironmentVariable("DJ_COPILOT_NATIVE_DIR");
    if (directory.isEmpty()) return;
    auto* view = new MixxxView(players);
    QObject::connect(players, &PlayerManager::numberOfDecksChanged, view, [view] { view->snapshot(); });
    view->snapshot();
    // Bind before the first controller/library load even if the client is absent.
    auto* observer = new QTimer(view);
    QObject::connect(observer, &QTimer::timeout, view, [view] { view->snapshot(); });
    observer->start(100);
    auto* server = new CopilotBridgeServer(directory, qEnvironmentVariable("DJ_COPILOT_MUSIC_ROOT"),
            "mixxx-2.5.6", [view] { return view->snapshot(); }, view);
    QString error;
    if (!server->start(&error)) {
        qWarning() << "DJ Copilot IPC disabled:" << error;
        delete view;
    } else {
        qInfo() << "DJ Copilot IPC: observation/preflight only; automatic loading DISABLED.";
    }
}
