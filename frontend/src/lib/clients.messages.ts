import type { Locale } from "platform-core";
import type { McpClient, McpClientGroup } from "./clients";

/**
 * The connect guide in other languages. `clients.ts` stays the English
 * source (it also writes the README); this overlays its prose per client
 * id - snippets, commands, paths and URLs are never translated, and the
 * other apps' own menu and button names stay as they appear in English.
 * `{name}`/`{url}`/`{site}` and `code` spans work as in `clients.ts`.
 * A step list must match the English one step for step; anything missing
 * falls back to English.
 */
export interface McpClientCopy {
  summary?: string;
  requirements?: string[];
  steps?: string[];
  notes?: string[];
  verify?: string;
  troubleshooting?: string[];
}

type Copy = {
  groups: Record<McpClientGroup, string>;
  platforms: Record<string, string>;
  clients: Record<string, McpClientCopy>;
};

const VI: Copy = {
  groups: { chat: "Ứng dụng trò chuyện", editor: "Trình soạn code", cli: "Dòng lệnh", other: "Khác" },
  platforms: { Web: "Web", Desktop: "Máy tính", Phone: "Điện thoại", Terminal: "Terminal" },
  clients: {
    "claude-connector": {
      summary: "claude.ai, ứng dụng máy tính và ứng dụng điện thoại - một custom connector.",
      steps: [
        "Trong Claude - claude.ai hoặc ứng dụng máy tính - mở Customize → Connectors, bấm Add, rồi “Add custom connector”. (Phiên bản cũ: Settings → Connectors.)",
        "Name: `{name}`. MCP server URL - rồi bấm Continue:",
        "Claude kiểm tra máy chủ và hiện các thiết lập đăng nhập: giữ nguyên những mục được đánh dấu Detected - Authentication “Sign in now”, OAuth client “Register automatically”, không có request header. Đừng chọn “Use Claude's published identity”: máy chủ này không hỗ trợ. Rồi bấm Add.",
        "Bấm Connect. Một cửa sổ mở ra trên {site}: đăng nhập nếu được hỏi, rồi bấm Cho phép.",
        "Trong một cuộc trò chuyện, mở + → Connectors và bật nó lên.",
      ],
      notes: [
        "Connector thêm trên claude.ai cũng dùng được trong ứng dụng máy tính và điện thoại. Với gói Team hoặc Enterprise, chủ sở hữu thêm một lần trong Organization settings → Connectors, sau đó từng thành viên bấm Connect.",
        "Máy chủ phải truy cập được từ internet qua HTTPS: Claude kết nối từ máy chủ của Anthropic, không phải từ máy tính của bạn.",
      ],
      verify: "Customize → Connectors hiện nó là đã kết nối, và nó có trong mục Ứng dụng đã kết nối trên trang Truy cập MCP.",
      troubleshooting: [
        "“Couldn't connect” ngay sau khi bấm Add: URL phải là HTTPS công khai - máy chủ của Anthropic không truy cập được địa chỉ localhost hay mạng nội bộ.",
        "“A connector with this URL already exists”: connector đã được thêm - hãy bật nó từ + → Connectors trong một cuộc trò chuyện.",
        "Đã kết nối nhưng Claude không bao giờ dùng: bật nó từ + → Connectors trong cuộc trò chuyện đó, hoặc nhắc tên nó trong câu hỏi.",
      ],
    },
    chatgpt: {
      summary: "chatgpt.com - một custom MCP server, thêm dưới dạng plugin.",
      requirements: ["Với gói Business và Enterprise, chủ workspace có thể cần cho phép custom MCP server trước."],
      steps: [
        "Trên chatgpt.com, mở Plugins ở thanh bên, bấm Add, rồi “Add custom MCP server”.",
        "Name: `{name}`. Trong Connection, giữ Server URL và dán:",
        "Authentication: OAuth. Đánh dấu “I understand and want to continue”, rồi bấm “Create as a plugin”.",
        "Một cửa sổ mở ra trên {site}: đăng nhập nếu được hỏi, rồi bấm Cho phép.",
        "Trong một cuộc trò chuyện, bấm + và chọn ứng dụng, hoặc nhắc tên nó trong câu hỏi. ChatGPT sẽ hỏi trước mỗi thay đổi.",
      ],
      verify: "Plugins liệt kê nó trong mục Installed, và nó có trong mục Ứng dụng đã kết nối trên trang Truy cập MCP.",
      troubleshooting: [
        "Không có trang Plugins hoặc không có “Add custom MCP server”: tài khoản cũ có ở Settings → Apps → Advanced settings → Developer mode, rồi Create.",
        "Chỉ đọc mà không bao giờ thay đổi gì: kiểm tra quyền của ứng dụng ở Settings → Plugins (“Allow low-risk tools” sẽ hỏi trước khi thay đổi).",
        "Đã kết nối nhưng không bao giờ được dùng: chọn nó từ + trong cuộc trò chuyện đó, hoặc nhắc tên nó trong câu hỏi.",
      ],
    },
    "gemini-web": {
      summary: "gemini.google.com và ứng dụng Gemini trên điện thoại - một custom app.",
      requirements: [
        "Tài khoản Google cá nhân (không phải tài khoản công việc hay trường học), từ 18 tuổi trở lên. Custom app vẫn đang được triển khai dần, nên chưa phải tài khoản nào cũng có.",
        "Bật Keep Activity (Gemini → Settings → Activity).",
      ],
      steps: [
        "Trên máy tính, mở gemini.google.com → Settings (góc dưới bên trái) → Personal Intelligence → Connected Apps.",
        "Trong Custom apps, bấm “Add a custom app” và dán chính xác URL này - không có dấu gạch chéo ở cuối:",
        "Bấm Next. Một cửa sổ mở ra trên {site}: đăng nhập nếu được hỏi, rồi bấm Cho phép.",
        "Trong một cuộc trò chuyện, gõ @ và chọn ứng dụng. Khi đã kết nối ở đây, nó cũng dùng được trong ứng dụng Gemini trên điện thoại. Gemini sẽ hỏi trước mỗi thay đổi.",
      ],
      verify: "Connected Apps liệt kê nó trong Custom apps, và nó có trong mục Ứng dụng đã kết nối trên trang Truy cập MCP.",
      troubleshooting: [
        "Không có Personal Intelligence hay Custom apps: tài khoản chưa có custom app (xem ở trên) - tính năng vẫn đang được triển khai dần.",
        "“This MCP server is already connected”: đã được thêm - gõ @ trong một cuộc trò chuyện để dùng.",
        "Đã đăng nhập nhưng Gemini không làm gì với nó: bật Keep Activity.",
      ],
    },
    cursor: {
      summary: "Một tệp cấu hình, cho mọi dự án hoặc một dự án.",
      steps: ["Thêm đoạn này vào `~/.cursor/mcp.json` (mọi dự án) hoặc `.cursor/mcp.json` (một dự án)."],
      verify: "Settings → MCP hiện máy chủ với chấm xanh và các công cụ của nó.",
    },
    vscode: {
      summary: "Chế độ agent của Copilot; token được lưu trong kho bí mật.",
      steps: [
        "Thêm đoạn này vào `.vscode/mcp.json` (hoặc chạy “MCP: Open User Configuration”). VS Code hỏi token ở lần đầu và lưu an toàn, nên token không bao giờ nằm trong tệp.",
      ],
      verify: "Chạy “MCP: List Servers”, khởi động máy chủ, rồi chọn các công cụ của nó trong chế độ agent của Copilot Chat.",
    },
    windsurf: {
      summary: "Một tệp cấu hình cho Cascade.",
      steps: ["Thêm đoạn này vào `~/.codeium/windsurf/mcp_config.json`, rồi làm mới trong Settings → Cascade → MCP servers."],
      verify: "Máy chủ hiện cùng các công cụ của nó trong mục MCP servers của Cascade.",
    },
    "claude-code": {
      summary: "Một câu lệnh; đăng nhập qua trình duyệt hoặc dùng token.",
      steps: [
        "Chạy lệnh này trong terminal. Thêm `--scope user` để dùng trong mọi dự án, hoặc `--scope project` để chia sẻ với một repo qua `.mcp.json`.",
        "Hoặc bỏ `--header` thì không cần token: chạy `/mcp` trong một phiên, chọn máy chủ và chọn Authenticate để đăng nhập qua trình duyệt.",
      ],
      notes: [
        "Với `--scope project`, đừng để token trong tệp dùng chung: `\"Authorization\": \"Bearer ${MCP_TOKEN}\"` trong `.mcp.json` được đọc từ biến môi trường.",
      ],
      verify: "Chạy `claude mcp list`, hoặc `/mcp` trong một phiên, và kiểm tra máy chủ hiện là đã kết nối.",
    },
    codex: {
      summary: "Một tệp cấu hình; token lấy từ biến môi trường.",
      steps: [
        "Thêm đoạn này vào `~/.codex/config.toml` (`codex mcp add <name> --url <url> --bearer-token-env-var <VAR>` cũng ghi y như vậy).",
        "Codex đọc token từ biến môi trường, nên hãy export nó trong tệp cấu hình shell của bạn.",
      ],
      verify: "Chạy `codex mcp list`, hoặc `/mcp` trong một phiên.",
    },
    gemini: {
      summary: "Một tệp cài đặt, cho bạn hoặc một dự án.",
      steps: ["Thêm đoạn này vào `~/.gemini/settings.json` (hoặc `.gemini/settings.json` trong một dự án)."],
      verify: "Chạy `/mcp` trong một phiên.",
    },
    "claude-desktop": {
      summary: "Chỉ dùng khi không có custom connector - cần Node.js.",
      steps: [
        "Connector của Claude đơn giản hơn; chỉ dùng cách này khi bạn không có custom connector. Mở Settings → Developer → Edit Config (`claude_desktop_config.json`: `~/Library/Application Support/Claude/` trên macOS, `%APPDATA%\\Claude\\` trên Windows).",
        "Gộp đoạn này vào `mcpServers`, rồi khởi động lại Claude Desktop. Cần Node.js: `mcp-remote` nối ứng dụng máy tính với máy chủ này bằng token của bạn.",
        "Máy chủ phải truy cập được qua HTTPS, trừ khi chạy trên localhost; với `http://` thường trên máy khác, thêm `\"--allow-http\"` vào `args`.",
      ],
      notes: ["Header được truyền qua `env` vì khoảng trắng trong `args` bị hỏng trên một số nền tảng."],
      verify: "Biểu tượng công cụ trong một cuộc trò chuyện mới liệt kê các công cụ của máy chủ.",
    },
    other: {
      summary: "Mọi ứng dụng hỗ trợ Streamable HTTP và header tùy chỉnh.",
      steps: [
        "Mọi ứng dụng hỗ trợ giao thức Streamable HTTP của MCP với header tùy chỉnh đều dùng được: trỏ nó tới URL và gửi `Authorization: Bearer <token>`. Để tự thử token:",
      ],
      verify: "Phản hồi liệt kê các công cụ; lỗi 401 nghĩa là token sai, đã hết hạn hoặc đã bị thu hồi.",
    },
  },
};

const COPY: Partial<Record<Locale, Copy>> = { vi: VI };

/** The client's guide in `locale` - English where there's no translation. */
export function localizeClient(client: McpClient, locale: Locale): McpClient {
  const copy = COPY[locale];
  if (!copy) return client;
  const text = copy.clients[client.id] ?? {};
  const list = (translated: string[] | undefined, english: string[] | undefined) =>
    english && translated?.length === english.length ? translated : english;
  return {
    ...client,
    summary: text.summary ?? client.summary,
    platforms: client.platforms.map((platform) => copy.platforms[platform] ?? platform),
    requirements: list(text.requirements, client.requirements),
    steps:
      text.steps?.length === client.steps.length
        ? client.steps.map((step, index) => ({ ...step, text: text.steps![index] }))
        : client.steps,
    notes: list(text.notes, client.notes),
    verify: text.verify ?? client.verify,
    troubleshooting: list(text.troubleshooting, client.troubleshooting),
  };
}

/** A picker group's heading in `locale`. */
export function localizeGroup(group: { id: McpClientGroup; label: string }, locale: Locale): string {
  return COPY[locale]?.groups[group.id] ?? group.label;
}
