import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

const inputSchema = {
  appid: z
    .number()
    .int()
    .positive()
    .describe("Steam application ID that the Workshop item belongs to"),
  title: z.string().min(1).describe("Title for the Workshop item"),
  description: z
    .string()
    .optional()
    .describe("Description for the Workshop item"),
  content_path: z
    .string()
    .optional()
    .describe("Local folder path containing the item content"),
  preview_path: z
    .string()
    .optional()
    .describe("Local path to a preview image (JPG/PNG, <1MB)"),
  tags: z
    .array(z.string())
    .optional()
    .describe("Tags for discoverability"),
  visibility: z
    .enum(["public", "friends_only", "private", "unlisted"])
    .optional()
    .describe("Item visibility (default: public)"),
};

export function register(server: McpServer): void {
  server.tool(
    "steam.uploadWorkshopItem",
    "Get code examples and documentation for uploading new Steam Workshop items. Workshop uploads require the Steamworks SDK (ISteamUGC) running in a client or dedicated tool — there is no HTTP upload endpoint. This tool returns ready-to-use code for C++, C#, and GDScript.",
    inputSchema,
    async ({ appid, title, description, content_path, preview_path, tags, visibility }) => {
      const visMap: Record<string, string> = {
        public: "k_ERemoteStoragePublishedFileVisibilityPublic",
        friends_only: "k_ERemoteStoragePublishedFileVisibilityFriendsOnly",
        private: "k_ERemoteStoragePublishedFileVisibilityPrivate",
        unlisted: "k_ERemoteStoragePublishedFileVisibilityUnlisted",
      };
      const vis = visibility ?? "public";
      const visEnum = visMap[vis];

      const guide = {
        note: "Workshop uploads are a two-step client-side SDK operation: CreateItem then SubmitItemUpdate. There is no HTTP endpoint for file uploads. Use the code below in a game client or upload tool.",
        appid,
        title,
        description: description ?? "",
        content_path: content_path ?? "<your_content_folder>",
        preview_path: preview_path ?? "<your_preview.jpg>",
        tags: tags ?? [],
        visibility: vis,
        workflow: [
          "1. Call CreateItem to get a PublishedFileId",
          "2. Call StartItemUpdate with the PublishedFileId",
          "3. Set title, description, content folder, preview image, tags, visibility",
          "4. Call SubmitItemUpdate to upload",
          "5. Handle SubmitItemUpdateResult_t callback for success/failure",
        ],
        cpp: [
          '#include "steam/steam_api.h"',
          "",
          `// Step 1: Create the item`,
          `SteamAPICall_t call = SteamUGC()->CreateItem(${appid}, k_EWorkshopFileTypeCommunity);`,
          "// Handle CreateItemResult_t callback...",
          "",
          "// Step 2-4: In the CreateItem callback:",
          "void OnItemCreated(CreateItemResult_t* pResult, bool bIOFailure) {",
          "  if (pResult->m_eResult != k_EResultOK) { /* handle error */ }",
          "  PublishedFileId_t fileId = pResult->m_nPublishedFileId;",
          "",
          `  UGCUpdateHandle_t handle = SteamUGC()->StartItemUpdate(${appid}, fileId);`,
          `  SteamUGC()->SetItemTitle(handle, "${title}");`,
          description
            ? `  SteamUGC()->SetItemDescription(handle, "${description}");`
            : "  // SteamUGC()->SetItemDescription(handle, \"...\");",
          `  SteamUGC()->SetItemContent(handle, "${content_path ?? "/path/to/content"}");`,
          `  SteamUGC()->SetItemPreview(handle, "${preview_path ?? "/path/to/preview.jpg"}");`,
          `  SteamUGC()->SetItemVisibility(handle, ${visEnum});`,
          ...(tags && tags.length > 0
            ? [
                "  SteamParamStringArray_t tagArray;",
                `  const char* tagStrings[] = { ${tags.map((t) => `"${t}"`).join(", ")} };`,
                `  tagArray.m_ppStrings = tagStrings;`,
                `  tagArray.m_nNumStrings = ${tags.length};`,
                "  SteamUGC()->SetItemTags(handle, &tagArray);",
              ]
            : []),
          "",
          '  SteamUGC()->SubmitItemUpdate(handle, "Initial upload");',
          "  // Handle SubmitItemUpdateResult_t callback...",
          "}",
        ].join("\n"),
        gdscript: [
          "# Using GodotSteam",
          `var app_id = ${appid}`,
          "",
          "# Step 1: Create item",
          "Steam.createItem(app_id, Steam.WORKSHOP_FILE_TYPE_COMMUNITY)",
          "# Connect to item_created signal",
          "",
          "func _on_item_created(result: int, file_id: int, accept_tos: bool) -> void:",
          "  if result != Steam.RESULT_OK:",
          '    print("Failed to create item")',
          "    return",
          "  var handle = Steam.startItemUpdate(app_id, file_id)",
          `  Steam.setItemTitle(handle, "${title}")`,
          `  Steam.setItemContent(handle, "${content_path ?? "res://workshop_content"}")`,
          `  Steam.setItemPreview(handle, "${preview_path ?? "res://preview.png"}")`,
          `  Steam.setItemVisibility(handle, Steam.REMOTE_STORAGE_PUBLISHED_FILE_VISIBILITY_${vis.toUpperCase()})`,
          '  Steam.submitItemUpdate(handle, "Initial upload")',
        ].join("\n"),
        references: [
          "https://partner.steamgames.com/doc/api/ISteamUGC#CreateItem",
          "https://partner.steamgames.com/doc/api/ISteamUGC#SubmitItemUpdate",
          "https://partner.steamgames.com/doc/features/workshop/implementation",
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
