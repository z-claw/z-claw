import i18n from "i18next";
import { initReactI18next } from "react-i18next";

const zhCN = {
  translation: {
    // Sidebar / sessions
    "sidebar.sessions": "会话",
    "sidebar.newSession": "新建会话",
    "sidebar.deleteSession": "删除",
    "sidebar.renameSession": "重命名",
    "sidebar.noSessions": "暂无会话",
    // Chat panel
    "chat.emptyTitle": "先选一个会话",
    "chat.emptyDescription": "在左侧创建或选择会话后，这里会显示该会话的消息时间线。",
    "chat.noMessages": "尚无消息。在下方输入并发送即可开始。",
    "chat.you": "你",
    "chat.assistant": "助手",
    "chat.streaming": "输出中…",
    "chat.toolCallStarted": "工具调用",
    "chat.toolCallFinished_ok": "完成",
    "chat.toolCallFinished_err": "失败",
    "chat.searchPlaceholder": "在此会话中搜索…",
    "chat.searchNoResults": "未找到匹配消息",
    // Event log
    "eventLog.empty": "等待 kernel-event",
    "eventLog.emptyDescription": "Ready、工具调用、策略拦截等会出现在此列表。",
    "eventLog.rawJson": "原始 JSON",
    // Input area
    "input.placeholder": "输入消息…（Shift+Enter 换行）",
    "input.send": "发送",
    // General
    "kernel.error": "内核错误",
    "kernel.commandFailed": "指令未送达内核",
    "approval.title": "工具执行审批",
    "approval.description": "助手正在请求执行以下工具，请确认是否允许：",
    "approval.approve": "允许",
    "approval.reject": "拒绝",
    "approval.tool": "工具",
    "approval.arguments": "参数",
  },
};

i18n.use(initReactI18next).init({
  resources: { "zh-CN": zhCN },
  lng: "zh-CN",
  fallbackLng: "zh-CN",
  interpolation: { escapeValue: false },
});

export default i18n;
