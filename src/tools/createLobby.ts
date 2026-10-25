import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { escapeStringLiteral } from "../utils/string-literal.js";
import { LOCAL_ONLY } from "../utils/annotations.js";

const inputSchema = {
  type: z
    .enum(["private", "friends_only", "public", "invisible"])
    .describe("Lobby visibility type"),
  max_members: z
    .number()
    .int()
    .min(2)
    .max(250)
    .describe("Maximum number of players in the lobby"),
  metadata: z
    .record(z.string(), z.string())
    .optional()
    .describe(
      "Key-value pairs for lobby metadata (e.g. map name, game mode)",
    ),
};

export function register(server: McpServer): void {
  server.registerTool(
    "steam_createLobby",
    {
      title: "Create Lobby (SDK Guide)",
      description:
        "Get code examples and documentation for creating Steam multiplayer lobbies. Lobby creation is a client-side SDK operation (ISteamMatchmaking) and cannot be done via HTTP API. This tool returns ready-to-use code for C++, C#, and GDScript.",
      inputSchema,
      annotations: LOCAL_ONLY,
    },
    async ({ type, max_members, metadata }) => {
      const lobbyTypeMap: Record<string, string> = {
        private: "k_ELobbyTypePrivate",
        friends_only: "k_ELobbyTypeFriendsOnly",
        public: "k_ELobbyTypePublic",
        invisible: "k_ELobbyTypeInvisible",
      };

      const enumValue = lobbyTypeMap[type];
      const metaEntries = Object.entries(metadata ?? {});
      const metaCpp = metaEntries
        .map(
          ([k, v]) =>
            `  SteamMatchmaking()->SetLobbyData(lobbyId, ${escapeStringLiteral(k, "cpp")}, ${escapeStringLiteral(v, "cpp")});`,
        )
        .join("\n");
      const metaCs = metaEntries
        .map(
          ([k, v]) =>
            `  SteamMatchmaking.SetLobbyData(lobbyId, ${escapeStringLiteral(k, "csharp")}, ${escapeStringLiteral(v, "csharp")});`,
        )
        .join("\n");
      const metaGd = metaEntries
        .map(
          ([k, v]) =>
            `  Steam.setLobbyData(lobby_id, ${escapeStringLiteral(k, "gdscript")}, ${escapeStringLiteral(v, "gdscript")})`,
        )
        .join("\n");

      const guide = {
        note: "Lobby creation is a client-side Steamworks SDK operation. It cannot be performed via HTTP API. Use the code below in your game client.",
        lobby_type: type,
        lobby_type_enum: enumValue,
        max_members,
        metadata: metadata ?? {},
        cpp: [
          '#include "steam/steam_api.h"',
          "",
          "// Call SteamAPI_RunCallbacks() every frame so the call result fires.",
          "class LobbyCreator {",
          "public:",
          "  void Create() {",
          `    SteamAPICall_t call = SteamMatchmaking()->CreateLobby(${enumValue}, ${max_members});`,
          "    m_LobbyCreated.Set(call, this, &LobbyCreator::OnLobbyCreated);",
          "  }",
          "",
          "private:",
          "  void OnLobbyCreated(LobbyCreated_t* pResult, bool bIOFailure) {",
          "    if (bIOFailure || pResult->m_eResult != k_EResultOK) { /* handle error */ return; }",
          "    CSteamID lobbyId(pResult->m_ulSteamIDLobby);",
          metaCpp.replace(/^ {2}/gm, "    "),
          "  }",
          "",
          "  CCallResult<LobbyCreator, LobbyCreated_t> m_LobbyCreated;",
          "};",
        ].join("\n"),
        csharp: [
          "// Using Steamworks.NET (keep a reference to the CallResult so it is not collected)",
          "using Steamworks;",
          "",
          "private CallResult<LobbyCreated_t> m_LobbyCreated;",
          "",
          "void CreateLobby() {",
          "  m_LobbyCreated = CallResult<LobbyCreated_t>.Create(OnLobbyCreated);",
          `  SteamAPICall_t call = SteamMatchmaking.CreateLobby(ELobbyType.${enumValue}, ${max_members});`,
          "  m_LobbyCreated.Set(call);",
          "}",
          "",
          "void OnLobbyCreated(LobbyCreated_t result, bool bIOFailure) {",
          "  if (bIOFailure || result.m_eResult != EResult.k_EResultOK) { /* handle error */ return; }",
          "  var lobbyId = new CSteamID(result.m_ulSteamIDLobby);",
          metaCs,
          "}",
        ].join("\n"),
        gdscript: [
          "# Using GodotSteam (Godot 4)",
          "func _ready() -> void:",
          "  Steam.lobby_created.connect(_on_lobby_created)",
          `  Steam.createLobby(Steam.LOBBY_TYPE_${type.toUpperCase()}, ${max_members})`,
          "",
          "func _on_lobby_created(this_connect: int, lobby_id: int) -> void:",
          "  if this_connect != 1:",
          "    print(\"Failed to create lobby\")",
          "    return",
          metaGd,
        ].join("\n"),
        references: [
          "https://partner.steamgames.com/doc/api/ISteamMatchmaking#CreateLobby",
          "https://partner.steamgames.com/doc/features/multiplayer/matchmaking",
        ],
      };

      return {
        content: [
          { type: "text" as const, text: JSON.stringify(guide, null, 2) },
        ],
      };
    },
  );
}
