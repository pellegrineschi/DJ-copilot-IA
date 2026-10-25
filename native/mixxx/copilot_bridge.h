#pragma once
class PlayerManager;
// Opt-in only; does nothing unless DJ_COPILOT_NATIVE_DIR is set.
void startCopilotBridge(PlayerManager* players);
