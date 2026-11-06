import type { ReactNode } from "react";
import { defineMessages } from "platform-core";

const messages = defineMessages({
  en: {
    whichApp: "Which app do you use?",
    allApps: "← All apps",
    signInNoToken: "Sign in, no token",
    personalToken: "Personal access token",
    token: "Token",
    beforeYouStart: "Before you start",
    serverUrl: "Server URL",
    creating: "Creating…",
    createToken: "Create a token",
    fillsIn: (v: { placeholder: string }): ReactNode => (
      <>
        Fills in <code>{v.placeholder}</code> below. It's shown only once - copy the snippet now.
      </>
    ),
    screenshot: "Screenshot: {text}",
    connected: "Connected",
    connectedVia: "Connected - {via}",
    reached: "{client} reached the server. Try asking it:",
    firstPrompt: "What can you do with {server}?",
    chatImageAlt: "Example: asking “What can you do with {server}?” in a chat",
    nothingYet: "Nothing from {client} yet",
    keepWaiting: "Keep waiting",
    waiting: "Waiting for {client} to connect…",
    updatesWhenSignsIn: "This updates by itself as soon as {client} signs in. In {client}:",
    updatesWhenToken: "This updates by itself as soon as {client} uses the token. In {client}:",
    notWorking: "Not working?",
    checkedOn: "Steps last checked {date}.",
    notTested: "These steps haven't been tested end to end yet - menus may differ.",
    openFullSize: "Open full size",
    setupTokenName: "Setup",
    thisSite: "this site",
  },
  vi: {
    whichApp: "Bạn dùng ứng dụng nào?",
    allApps: "← Tất cả ứng dụng",
    signInNoToken: "Đăng nhập, không cần token",
    personalToken: "Token truy cập cá nhân",
    token: "Token",
    beforeYouStart: "Trước khi bắt đầu",
    serverUrl: "URL máy chủ",
    creating: "Đang tạo…",
    createToken: "Tạo token",
    fillsIn: (v: { placeholder: string }): ReactNode => (
      <>
        Điền vào chỗ <code>{v.placeholder}</code> bên dưới. Token chỉ hiển thị một lần - hãy sao chép đoạn cấu hình ngay.
      </>
    ),
    screenshot: "Ảnh chụp màn hình: {text}",
    connected: "Đã kết nối",
    connectedVia: "Đã kết nối - {via}",
    reached: "{client} đã kết nối tới máy chủ. Hãy thử hỏi:",
    firstPrompt: "Bạn có thể làm gì với {server}?",
    chatImageAlt: "Ví dụ: hỏi “What can you do with {server}?” trong một cuộc trò chuyện",
    nothingYet: "Chưa nhận được gì từ {client}",
    keepWaiting: "Tiếp tục chờ",
    waiting: "Đang chờ {client} kết nối…",
    updatesWhenSignsIn: "Trang này tự cập nhật ngay khi {client} đăng nhập. Trong {client}:",
    updatesWhenToken: "Trang này tự cập nhật ngay khi {client} dùng token. Trong {client}:",
    notWorking: "Không hoạt động?",
    checkedOn: "Các bước được kiểm tra lần cuối ngày {date}.",
    notTested: "Các bước này chưa được thử đầy đủ - menu có thể khác.",
    openFullSize: "Mở kích thước đầy đủ",
    setupTokenName: "Cài đặt",
    thisSite: "trang này",
  },
});

export default messages;
