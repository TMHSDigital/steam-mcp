import { describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { register as registerLobby } from "../createLobby.js";
import { register as registerWorkshop } from "../uploadWorkshopItem.js";

async function callGuide(name: string, args: Record<string, unknown>) {
  const server = new McpServer({ name: "sdk-guide-test", version: "1.0.0" });
  registerLobby(server);
  registerWorkshop(server);
  const client = new Client({ name: "sdk-guide-client", version: "1.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  try {
    const result = await client.callTool({ name, arguments: args });
    expect(result.isError).not.toBe(true);
    const content = result.content as Array<{ type: string; text: string }>;
    return JSON.parse(content[0].text) as Record<string, unknown>;
  } finally {
    await client.close();
    await server.close();
  }
}

describe("SDK guides", () => {
  it("escapes Workshop text, Windows paths and tags in every generated language", async () => {
    const title = 'A "quoted" title\nnext line';
    const description = 'Line one\r\nLine two\twith "quotes"';
    const content_path = "C:\\mods\\new";
    const preview_path = 'C:\\images\\my "preview".png';
    const tag = 'tag"\\value';
    const guide = await callGuide("steam_uploadWorkshopItem", {
      appid: 480, title, description, content_path, preview_path, tags: [tag],
    });

    expect(guide.title).toBe(title);
    expect(guide.description).toBe(description);
    expect(guide.content_path).toBe(content_path);
    expect(guide.preview_path).toBe(preview_path);
    expect(guide.tags).toEqual([tag]);
    for (const language of ["cpp", "gdscript"]) {
      const code = guide[language] as string;
      expect(code).toContain('A \\"quoted\\" title');
      expect(code).toContain('C:\\\\mods\\\\new');
      expect(code).toContain('C:\\\\images\\\\my \\"preview\\".png');
      expect(code).not.toContain(title);
    }
    expect(guide.cpp).toContain('tag\\"\\\\value');
    expect(guide.cpp).toContain('Line one\\015\\012Line two\\011with \\"quotes\\"');
    expect(guide.gdscript).toContain('title\\nnext line');
  });

  it("escapes lobby metadata keys and values without changing metadata", async () => {
    const metadata = { 'map"\\name': 'C:\\maps\\new\n"arena"' };
    const guide = await callGuide("steam_createLobby", {
      type: "public", max_members: 4, metadata,
    });

    expect(guide.metadata).toEqual(metadata);
    for (const language of ["cpp", "csharp", "gdscript"]) {
      const code = guide[language] as string;
      expect(code).toContain('"map\\"\\\\name"');
      expect(code).toContain('C:\\\\maps\\\\new');
      expect(code).toContain('\\"arena\\"');
      expect(code).not.toContain(metadata['map"\\name']);
    }
    expect(guide.cpp).toContain('new\\012\\"arena\\"');
    expect(guide.csharp).toContain('new\\n\\"arena\\"');
    expect(guide.gdscript).toContain('new\\n\\"arena\\"');
  });

  it("retains ordinary defaults and empty strings in guides", async () => {
    const workshop = await callGuide("steam_uploadWorkshopItem", { appid: 480, title: "Example" });
    expect(workshop.cpp).toContain('SetItemTitle(handle, "Example")');
    expect(workshop.cpp).toContain('SetItemContent(handle, "/path/to/content")');
    expect(workshop.gdscript).toContain('"res://workshop_content"');
    const lobby = await callGuide("steam_createLobby", {
      type: "private", max_members: 2, metadata: { empty: "" },
    });
    expect(lobby.csharp).toContain('SetLobbyData(lobbyId, "empty", "")');
  });
});

describe("SDK guide correctness (#54)", () => {
  it("lobby guide uses Steamworks.NET enum names, registers call results, and avoids shadowing connect", async () => {
    const lobby = await callGuide("steam_createLobby", { type: "friends_only", max_members: 8 });
    expect(lobby.csharp).toContain("ELobbyType.k_ELobbyTypeFriendsOnly");
    expect(lobby.csharp).not.toMatch(/ELobbyType\.FriendsOnly\b/);
    expect(lobby.csharp).toContain("CallResult<LobbyCreated_t>.Create(OnLobbyCreated)");
    expect(lobby.csharp).toContain("m_LobbyCreated.Set(call);");
    expect(lobby.cpp).toContain("m_LobbyCreated.Set(call, this, &LobbyCreator::OnLobbyCreated);");
    expect(lobby.cpp).toContain("CCallResult<LobbyCreator, LobbyCreated_t> m_LobbyCreated;");
    expect(lobby.gdscript).toContain("Steam.lobby_created.connect(_on_lobby_created)");
    expect(lobby.gdscript).toContain("this_connect: int");
    expect(lobby.gdscript).not.toMatch(/\(connect: int/);
  });

  it("Workshop guide returns every promised language and uses every input", async () => {
    const guide = await callGuide("steam_uploadWorkshopItem", {
      appid: 480,
      title: "Map pack",
      description: "Three maps",
      tags: ["Maps", "Co-op"],
      visibility: "unlisted",
    });
    for (const language of ["cpp", "csharp", "gdscript"]) {
      const code = guide[language] as string;
      expect(code, language).toContain("Map pack");
      expect(code, language).toContain("Three maps");
      expect(code, language).toContain("Co-op");
    }
    expect(guide.csharp).toContain("EWorkshopFileType.k_EWorkshopFileTypeCommunity");
    expect(guide.csharp).toContain(
      "ERemoteStoragePublishedFileVisibility.k_ERemoteStoragePublishedFileVisibilityUnlisted",
    );
    expect(guide.csharp).toContain('new List<string> { "Maps", "Co-op" }');
    expect(guide.cpp).toContain("m_ItemCreated.Set(call, this, &WorkshopUploader::OnItemCreated);");
    expect(guide.cpp).toContain("m_ItemSubmitted.Set(submit, this, &WorkshopUploader::OnItemSubmitted);");
    expect(guide.gdscript).toContain('Steam.setItemTags(handle, ["Maps", "Co-op"])');
    expect(guide.gdscript).toContain('Steam.setItemDescription(handle, "Three maps")');
  });

  it("omits optional calls when inputs are absent", async () => {
    const guide = await callGuide("steam_uploadWorkshopItem", { appid: 480, title: "Solo" });
    expect(guide.csharp).not.toContain("SetItemTags");
    expect(guide.gdscript).not.toContain("setItemTags");
    expect(guide.gdscript).toContain('# Steam.setItemDescription(handle, "...")');
  });
});
