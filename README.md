# 老師課堂助手・手機線框原型 v0.3.1

可點擊的純前端靜態 PWA，使用假資料示範上課時的作業檢查、考試點名、課堂提醒、加權抽籤與待處理流程。未連接 Google 或真實學生資料。

## 線上版本

https://1onsputt3r.github.io/teacher-classroom-assistant/

目前儲存庫與 GitHub Pages 均為公開；程式碼只包含介面、操作邏輯與假資料，不應提交真實學生資料、登入權杖或 Google 存取密鑰。

## 本機預覽

```bash
npm run dev
```

開啟 `http://127.0.0.1:4176/`（本輪驗收固定使用此連接埠）。

## 測試與建置

```bash
npm test
npm run build
```

完成後的 GitHub Pages 靜態檔案位於 `dist/`。主分支更新後，`.github/workflows/deploy-pages.yml` 會自動執行測試、建置並發布。

## 示範說明

- 頁首同步狀態可直接點擊輪換。
- 「更多」可開啟下課前 5 分鐘狀態、選擇同步狀態或重設假資料。
- 805／806／807 理化與高二3／高二4／高二5物理都可從頁首切換；每個 course key 都代表一組「班級＋科目」。
- session、待補交／待補考、提醒、抽籤與權重皆以「班級＋科目」分開保存在瀏覽器 localStorage；同年級同科目只共享建立的項目定義。
- 4 與 36 號為停用座號。
