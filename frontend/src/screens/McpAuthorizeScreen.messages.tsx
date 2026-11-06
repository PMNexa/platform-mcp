import type { ReactNode } from "react";
import { defineMessages } from "platform-core";

const messages = defineMessages({
  en: {
    checking: "Checking the request…",
    returning: "Returning you to the app…",
    cantConnect: "Can't connect this app",
    returnToApp: "Return to the app",
    title: "Connect {client} to {server}?",
    canDo: (v: { client: string; server: string }): ReactNode => (
      <>
        <strong>{v.client}</strong> will be able to read and change your data through the MCP server: everything you can
        do in {v.server}, nothing more.
      </>
    ),
    afterAllow: (v: { host: string }): ReactNode => (
      <>
        After you allow it, you'll go back to <strong>{v.host}</strong>. Only allow apps you started connecting yourself.
        You can disconnect it any time on the MCP access page.
      </>
    ),
    cancel: "Cancel",
    allow: "Allow",
  },
  vi: {
    checking: "Đang kiểm tra yêu cầu…",
    returning: "Đang đưa bạn về ứng dụng…",
    cantConnect: "Không thể kết nối ứng dụng này",
    returnToApp: "Quay lại ứng dụng",
    title: "Kết nối {client} với {server}?",
    canDo: (v: { client: string; server: string }): ReactNode => (
      <>
        <strong>{v.client}</strong> sẽ có thể đọc và thay đổi dữ liệu của bạn qua máy chủ MCP: mọi việc bạn làm được
        trong {v.server}, không hơn.
      </>
    ),
    afterAllow: (v: { host: string }): ReactNode => (
      <>
        Sau khi bạn cho phép, bạn sẽ được đưa về <strong>{v.host}</strong>. Chỉ cho phép những ứng dụng do chính bạn bắt
        đầu kết nối. Bạn có thể ngắt kết nối bất cứ lúc nào trên trang Truy cập MCP.
      </>
    ),
    cancel: "Hủy",
    allow: "Cho phép",
  },
});

export default messages;
