import type { ReactNode } from "react";
import { defineMessages } from "platform-core";

const messages = defineMessages({
  en: {
    navLabel: "MCP access",
    title: "MCP access",
    intro:
      "Let an AI assistant (Claude, ChatGPT, Gemini, Cursor, …) read and update your data through the MCP server. It can do exactly what you can, nothing more.",
    tokensTitle: "Personal access tokens",
    newToken: "New token",
    tokenCreated: "Token “{name}” created",
    copyNow: "Copy it now: it won't be shown again. The setup steps below already include it.",
    loading: "Loading…",
    noTokens: "No tokens yet. Create one for each client you connect.",
    colName: "Name",
    colToken: "Token",
    colCreated: "Created",
    colLastUsed: "Last used",
    colExpires: "Expires",
    never: "Never",
    expired: "Expired",
    revoke: "Revoke",
    confirmRevoke: "Revoke “{name}”? Any client using it stops working immediately.",
    appsTitle: "Connected apps",
    noApps: "None yet. Apps that sign in instead of using a token, like a Claude connector, show up here.",
    colApp: "App",
    colConnected: "Connected",
    disconnect: "Disconnect",
    confirmDisconnect: "Disconnect “{name}”? It loses access immediately.",
    connectTitle: "Connect an AI client",
    serverUrl: "Server URL",
    transportHint: (v: { header: string }): ReactNode => (
      <>
        Streamable HTTP transport, authenticated with OAuth or <code>{v.header}</code>
      </>
    ),
    serverFacts: (v: { name: string; tools: string }): ReactNode => (
      <>
        {" "}
        · server name <code>{v.name}</code> · {v.tools} tools
      </>
    ),
    skillsTitle: "Agent skills",
    thisApp: "this app",
    skillsIntro:
      "Skills are ready-made playbooks that teach your assistant the everyday jobs in {app}, on top of the raw tools. To install them, paste this into Claude Code, Codex or any agent that supports skills. It also walks through connecting the server if that isn't done yet.",
    skillsHint: (v: { url: string }): ReactNode => (
      <>
        <a href={v.url} target="_blank" rel="noreferrer">
          See what gets installed
        </a>
        . Run the same prompt again to update them.
      </>
    ),
    newTokenTitle: "New personal access token",
    cancel: "Cancel",
    createToken: "Create token",
    tokenNamePlaceholder: "e.g. Claude Code on my laptop",
    expiresAfter: "Expires after",
    days30: "30 days",
    days90: "90 days",
    year1: "1 year",
  },
  vi: {
    navLabel: "Truy cập MCP",
    title: "Truy cập MCP",
    intro:
      "Cho phép trợ lý AI (Claude, ChatGPT, Gemini, Cursor, …) đọc và cập nhật dữ liệu của bạn qua máy chủ MCP. Trợ lý làm được đúng những gì bạn làm được, không hơn.",
    tokensTitle: "Token truy cập cá nhân",
    newToken: "Token mới",
    tokenCreated: "Đã tạo token “{name}”",
    copyNow: "Hãy sao chép ngay: token sẽ không hiển thị lại. Các bước cài đặt bên dưới đã có sẵn token này.",
    loading: "Đang tải…",
    noTokens: "Chưa có token nào. Hãy tạo một token cho mỗi ứng dụng bạn kết nối.",
    colName: "Tên",
    colToken: "Token",
    colCreated: "Ngày tạo",
    colLastUsed: "Dùng lần cuối",
    colExpires: "Hết hạn",
    never: "Không bao giờ",
    expired: "Đã hết hạn",
    revoke: "Thu hồi",
    confirmRevoke: "Thu hồi “{name}”? Mọi ứng dụng đang dùng token này sẽ ngừng hoạt động ngay.",
    appsTitle: "Ứng dụng đã kết nối",
    noApps: "Chưa có. Các ứng dụng đăng nhập thay vì dùng token, như connector của Claude, sẽ hiện ở đây.",
    colApp: "Ứng dụng",
    colConnected: "Ngày kết nối",
    disconnect: "Ngắt kết nối",
    confirmDisconnect: "Ngắt kết nối “{name}”? Ứng dụng sẽ mất quyền truy cập ngay.",
    connectTitle: "Kết nối ứng dụng AI",
    serverUrl: "URL máy chủ",
    transportHint: (v: { header: string }): ReactNode => (
      <>
        Giao thức Streamable HTTP, xác thực bằng OAuth hoặc <code>{v.header}</code>
      </>
    ),
    serverFacts: (v: { name: string; tools: string }): ReactNode => (
      <>
        {" "}
        · tên máy chủ <code>{v.name}</code> · {v.tools} công cụ
      </>
    ),
    skillsTitle: "Kỹ năng cho trợ lý",
    thisApp: "ứng dụng này",
    skillsIntro:
      "Kỹ năng là các quy trình soạn sẵn, dạy trợ lý của bạn những việc hằng ngày trong {app}, ngoài các công cụ gốc. Để cài đặt, hãy dán nội dung này vào Claude Code, Codex hoặc bất kỳ trợ lý nào hỗ trợ kỹ năng. Trợ lý cũng sẽ hướng dẫn kết nối máy chủ nếu bạn chưa làm.",
    skillsHint: (v: { url: string }): ReactNode => (
      <>
        <a href={v.url} target="_blank" rel="noreferrer">
          Xem những gì sẽ được cài
        </a>
        . Chạy lại cùng câu lệnh để cập nhật.
      </>
    ),
    newTokenTitle: "Token truy cập cá nhân mới",
    cancel: "Hủy",
    createToken: "Tạo token",
    tokenNamePlaceholder: "vd: Claude Code trên laptop",
    expiresAfter: "Hết hạn sau",
    days30: "30 ngày",
    days90: "90 ngày",
    year1: "1 năm",
  },
});

export default messages;
