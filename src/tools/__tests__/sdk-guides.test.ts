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
