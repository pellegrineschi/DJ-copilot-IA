// TEST ONLY. No audio, no Mixxx. The production client rejects this provider.
#include "bridge_server.h"
#include <QCoreApplication>
#include <QFile>
#include <QJsonDocument>
#include <cstdio>

int main(int argc, char** argv) {
    QCoreApplication app(argc, argv);
    if (argc != 4) { std::fprintf(stderr, "usage: fixture IPC_DIRECTORY MUSIC_ROOT STATE_JSON\n"); return 2; }
    const QString statePath = QString::fromLocal8Bit(argv[3]);
    CopilotBridgeServer server(QString::fromLocal8Bit(argv[1]), QString::fromLocal8Bit(argv[2]),
            "fixture-only", [statePath] {
                QFile file(statePath);
                if (!file.open(QIODevice::ReadOnly)) return QJsonArray{};
                return QJsonDocument::fromJson(file.readAll()).array();
            });
    QString error;
    if (!server.start(&error)) { std::fprintf(stderr, "%s\n", error.toUtf8().constData()); return 1; }
    std::puts("Fixture IPC ready. NOT MIXXX. No track loading."); std::fflush(stdout);
    return app.exec();
}
