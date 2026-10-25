import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { escapeStringLiteral } from "../utils/string-literal.js";
import { LOCAL_ONLY } from "../utils/annotations.js";

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
  server.registerTool(
    "steam_uploadWorkshopItem",
    {
      title: "Upload Workshop Item (SDK Guide)",
      description:
        "Get code examples and documentation for uploading new Steam Workshop items. Workshop uploads require the Steamworks SDK (ISteamUGC) running in a client or dedicated tool — there is no HTTP upload endpoint. This tool returns ready-to-use code for C++, C#, and GDScript.",
      inputSchema,
      annotations: LOCAL_ONLY,
    },
    async ({ appid, title, description, content_path, preview_path, tags, visibility }) => {
      const visMap: Record<string, string> = {
        public: "k_ERemoteStoragePublishedFileVisibilityPublic",
        friends_only: "k_ERemoteStoragePublishedFileVisibilityFriendsOnly",
        private: "k_ERemoteStoragePublishedFileVisibilityPrivate",
        unlisted: "k_ERemoteStoragePublishedFileVisibilityUnlisted",
      };
      const vis = visibility ?? "public";
      const visEnum = visMap[vis];
      const tagList = tags ?? [];
      const cppContent = escapeStringLiteral(content_path ?? "/path/to/content", "cpp");
      const cppPreview = escapeStringLiteral(preview_path ?? "/path/to/preview.jpg", "cpp");
      const csContent = escapeStringLiteral(content_path ?? "C:/path/to/content", "csharp");
      const csPreview = escapeStringLiteral(preview_path ?? "C:/path/to/preview.jpg", "csharp");

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
          "// Call SteamAPI_RunCallbacks() every frame so the call results fire.",
          "class WorkshopUploader {",
          "public:",
          "  void Upload() {",
          `    SteamAPICall_t call = SteamUGC()->CreateItem(${appid}, k_EWorkshopFileTypeCommunity);`,
          "    m_ItemCreated.Set(call, this, &WorkshopUploader::OnItemCreated);",
          "  }",
          "",
          "private:",
          "  void OnItemCreated(CreateItemResult_t* pResult, bool bIOFailure) {",
          "    if (bIOFailure || pResult->m_eResult != k_EResultOK) { /* handle error */ return; }",
          "    if (pResult->m_bUserNeedsToAcceptWorkshopLegalAgreement) { /* show the Workshop legal agreement */ }",
          "",
          `    UGCUpdateHandle_t handle = SteamUGC()->StartItemUpdate(${appid}, pResult->m_nPublishedFileId);`,
          `    SteamUGC()->SetItemTitle(handle, ${escapeStringLiteral(title, "cpp")});`,
          description
            ? `    SteamUGC()->SetItemDescription(handle, ${escapeStringLiteral(description, "cpp")});`
            : "    // SteamUGC()->SetItemDescription(handle, \"...\");",
          `    SteamUGC()->SetItemContent(handle, ${cppContent});`,
          `    SteamUGC()->SetItemPreview(handle, ${cppPreview});`,
          `    SteamUGC()->SetItemVisibility(handle, ${visEnum});`,
          ...(tagList.length > 0
            ? [
                `    const char* tagStrings[] = { ${tagList.map((t) => escapeStringLiteral(t, "cpp")).join(", ")} };`,
                "    SteamParamStringArray_t tagArray;",
                "    tagArray.m_ppStrings = tagStrings;",
                `    tagArray.m_nNumStrings = ${tagList.length};`,
                "    SteamUGC()->SetItemTags(handle, &tagArray);",
              ]
            : []),
          "",
          '    SteamAPICall_t submit = SteamUGC()->SubmitItemUpdate(handle, "Initial upload");',
          "    m_ItemSubmitted.Set(submit, this, &WorkshopUploader::OnItemSubmitted);",
          "  }",
          "",
          "  void OnItemSubmitted(SubmitItemUpdateResult_t* pResult, bool bIOFailure) {",
          "    if (bIOFailure || pResult->m_eResult != k_EResultOK) { /* handle error */ }",
          "  }",
          "",
          "  CCallResult<WorkshopUploader, CreateItemResult_t> m_ItemCreated;",
          "  CCallResult<WorkshopUploader, SubmitItemUpdateResult_t> m_ItemSubmitted;",
          "};",
        ].join("\n"),
        csharp: [
          "// Using Steamworks.NET (keep references to the CallResults so they are not collected)",
          "using System.Collections.Generic;",
          "using Steamworks;",
          "",
          "private CallResult<CreateItemResult_t> m_ItemCreated;",
          "private CallResult<SubmitItemUpdateResult_t> m_ItemSubmitted;",
          "",
          "void Upload() {",
          "  m_ItemCreated = CallResult<CreateItemResult_t>.Create(OnItemCreated);",
          "  m_ItemSubmitted = CallResult<SubmitItemUpdateResult_t>.Create(OnItemSubmitted);",
          `  SteamAPICall_t call = SteamUGC.CreateItem(new AppId_t(${appid}), EWorkshopFileType.k_EWorkshopFileTypeCommunity);`,
          "  m_ItemCreated.Set(call);",
          "}",
          "",
          "void OnItemCreated(CreateItemResult_t result, bool bIOFailure) {",
          "  if (bIOFailure || result.m_eResult != EResult.k_EResultOK) { /* handle error */ return; }",
          "  if (result.m_bUserNeedsToAcceptWorkshopLegalAgreement) { /* show the Workshop legal agreement */ }",
          "",
          `  UGCUpdateHandle_t handle = SteamUGC.StartItemUpdate(new AppId_t(${appid}), result.m_nPublishedFileId);`,
          `  SteamUGC.SetItemTitle(handle, ${escapeStringLiteral(title, "csharp")});`,
          description
            ? `  SteamUGC.SetItemDescription(handle, ${escapeStringLiteral(description, "csharp")});`
            : "  // SteamUGC.SetItemDescription(handle, \"...\");",
          `  SteamUGC.SetItemContent(handle, ${csContent});`,
          `  SteamUGC.SetItemPreview(handle, ${csPreview});`,
          `  SteamUGC.SetItemVisibility(handle, ERemoteStoragePublishedFileVisibility.${visEnum});`,
          ...(tagList.length > 0
            ? [
                `  SteamUGC.SetItemTags(handle, new List<string> { ${tagList.map((t) => escapeStringLiteral(t, "csharp")).join(", ")} });`,
              ]
            : []),
          "",
          '  m_ItemSubmitted.Set(SteamUGC.SubmitItemUpdate(handle, "Initial upload"));',
          "}",
          "",
          "void OnItemSubmitted(SubmitItemUpdateResult_t result, bool bIOFailure) {",
          "  if (bIOFailure || result.m_eResult != EResult.k_EResultOK) { /* handle error */ }",
          "}",
        ].join("\n"),
        gdscript: [
          "# Using GodotSteam (Godot 4)",
          `var app_id: int = ${appid}`,
          "",
          "func _ready() -> void:",
          "  Steam.item_created.connect(_on_item_created)",
          "  Steam.item_updated.connect(_on_item_updated)",
          "  Steam.createItem(app_id, Steam.WORKSHOP_FILE_TYPE_COMMUNITY)",
          "",
          "func _on_item_created(result: int, file_id: int, accept_tos: bool) -> void:",
          "  if result != Steam.RESULT_OK:",
          '    print("Failed to create item")',
          "    return",
          "  if accept_tos:",
          "    pass # Show the Workshop legal agreement",
          "  var handle: int = Steam.startItemUpdate(app_id, file_id)",
          `  Steam.setItemTitle(handle, ${escapeStringLiteral(title, "gdscript")})`,
          description
            ? `  Steam.setItemDescription(handle, ${escapeStringLiteral(description, "gdscript")})`
            : '  # Steam.setItemDescription(handle, "...")',
          `  Steam.setItemContent(handle, ${escapeStringLiteral(content_path ?? "res://workshop_content", "gdscript")})`,
          `  Steam.setItemPreview(handle, ${escapeStringLiteral(preview_path ?? "res://preview.png", "gdscript")})`,
          `  Steam.setItemVisibility(handle, Steam.REMOTE_STORAGE_PUBLISHED_FILE_VISIBILITY_${vis.toUpperCase()})`,
          ...(tagList.length > 0
            ? [`  Steam.setItemTags(handle, [${tagList.map((t) => escapeStringLiteral(t, "gdscript")).join(", ")}])`]
            : []),
          '  Steam.submitItemUpdate(handle, "Initial upload")',
          "",
          "func _on_item_updated(result: int, accept_tos: bool) -> void:",
          "  if result != Steam.RESULT_OK:",
          '    print("Failed to submit item")',
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
