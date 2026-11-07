// QQ 增强 · 发送时自动 pangu 化
// 中英文、中文与数字之间补空格；消息开头打两个逗号（,, 或 ，，中英文都行）则去掉这两个逗号，
// 并且这一条不做 pangu。改动在点发送/按回车的那一刻落到编辑器里，不干预打字过程。

const CJK = "\\u3040-\\u30ff\\u3400-\\u4dbf\\u4e00-\\u9fff\\uf900-\\ufaff";
const COMMA_PREFIX = /^[\s ]*[,，][,，]/;

/* pangu 间距规则（中英文混排的常用子集） */
export function panguSpace(text) {
    if (!text) return text;
    let s = text;
    // 中文 ↔ 英文/数字
    s = s.replace(new RegExp("([" + CJK + "])([A-Za-z0-9])", "g"), "$1 $2");
    s = s.replace(new RegExp("([A-Za-z0-9])([" + CJK + "])", "g"), "$1 $2");
    // 中文 ↔ 半角括号和引号
    s = s.replace(new RegExp("([" + CJK + "])([\\[\\](){}<>\"'])", "g"), "$1 $2");
    s = s.replace(new RegExp("([\\[\\](){}<>\"'])([" + CJK + "])", "g"), "$1 $2");
    // 中文后面接半角标点不留空格
    s = s.replace(new RegExp("([" + CJK + "])\\s+([,.;:!?])", "g"), "$1$2");
    // 全角标点 ↔ 英文/数字之间补空格
    s = s.replace(new RegExp("([、。，：；！？“”（）])([A-Za-z0-9])", "g"), "$1 $2");
    s = s.replace(new RegExp("([A-Za-z0-9])([、。，：；！？“”（）])", "g"), "$1 $2");
    // 收尾：合并多余空格，清掉每行首尾空格
    s = s.replace(/[ \t]{2,}/g, " ");
    s = s.split("\n").map(l => l.replace(/^[ \t]+|[ \t]+$/g, "")).join("\n");
    return s;
}

function editorEl() {
    return document.querySelector(".chat-input-area .ProseMirror") || document.querySelector(".ProseMirror");
}

/* 编辑器里的可编辑文本节点：引用块、@ 提及、表情都不碰 */
function editableTextNodes(pm) {
    const out = [];
    const skip = ["editor-el__reply-wrapper", "editor-el__at", "editor-el__face", "editor-el__emoji"];
    const walk = node => {
        if (node.nodeType === 3) { out.push(node); return; }
        if (node.nodeType !== 1) return;
        const cls = typeof node.className === "string" ? node.className : "";
        if (skip.some(k => cls.indexOf(k) >= 0)) return;
        for (const c of node.childNodes) walk(c);
    };
    for (const c of pm.childNodes) walk(c);
    return out;
}

/* 用 execCommand 改文本，ProseMirror 会把这次改动当成用户输入读回自己的文档 */
function replaceNodeText(node, text) {
    if (node.data === text) return false;
    const range = document.createRange();
    range.selectNodeContents(node);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    try { return document.execCommand("insertText", false, text); } catch (e) { return false; }
}

/* 去掉开头的两个逗号（可能跨文本节点） */
function stripCommaPrefix(nodes) {
    let removed = 0;
    for (const n of nodes) {
        let s = n.data || "";
        const before = s;
        while (removed < 2) {
            const m = s.match(/^[\s ]*[,，]/);
            if (!m) break;
            s = s.slice(m[0].length);
            removed++;
        }
        if (s !== before) replaceNodeText(n, s);
        if (removed >= 2) break;
        if (s.trim()) break;
    }
    return removed > 0;
}

/* 返回 true 表示编辑器内容被改过 */
function transformEditor() {
    const pm = editorEl();
    if (!pm) return false;
    const nodes = editableTextNodes(pm);
    if (!nodes.length) return false;

    // 开头两个逗号可能被拆在两个文本节点里，拼起来判断
    const head = nodes.slice(0, 2).map(n => n.data || "").join("");
    if (COMMA_PREFIX.test(head)) return stripCommaPrefix(nodes) ? "prefix" : false;

    let changed = false;
    for (const n of nodes) {
        const t = panguSpace(n.data);
        if (t !== n.data && replaceNodeText(n, t)) changed = true;
    }
    return changed ? "pangu" : false;
}

function sendButton() {
    return document.querySelector(".chat-input-area > .operation .send-btn-wrap") ||
        document.querySelector(".chat-input-area > .operation .send") ||
        document.querySelector(".chat-input-area > .operation");
}

export function installPangu(getConfig, toast) {
    let busy = false;

    const run = () => {
        if (busy) return false;
        if (!getConfig().pangu) return false;
        busy = true;
        let result = false;
        try { result = transformEditor(); } catch (e) { result = false; }
        // 让位一小会儿，避免我们自己触发的发送又进来
        setTimeout(() => { busy = false; }, 120);
        if (result === "prefix" && toast) { try { toast("本条不 pangu 化"); } catch (e) { } }
        return !!result;
    };

    // 回车发送：先改文本，再点发送键（QQ 读的是改完的内容）
    document.addEventListener("keydown", e => {
        if (e.key !== "Enter" || e.shiftKey || e.isComposing || e.keyCode === 229) return;
        if (!getConfig().pangu) return;
        const pm = editorEl();
        if (!pm || !(e.target === pm || pm.contains(e.target))) return;
        if (!run()) return;
        e.preventDefault();
        e.stopImmediatePropagation();
        requestAnimationFrame(() => { const b = sendButton(); if (b) b.click(); });
    }, true);

    // 点发送键发送
    document.addEventListener("click", e => {
        const btn = e.target && e.target.closest &&
            e.target.closest(".chat-input-area > .operation .send-btn-wrap, .chat-input-area > .operation .send, .chat-input-area > .operation .send-msg");
        if (!btn || !getConfig().pangu) return;
        if (!run()) return;
        e.preventDefault();
        e.stopImmediatePropagation();
        requestAnimationFrame(() => { const b = sendButton(); if (b) b.click(); });
    }, true);
}
