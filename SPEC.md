# 專案：鹿野工地雷達（luye-site-radar）

> 興宗 2026-11-23 給的原始規格，原文照錄。有疑問先一次列出來問，確認後再動工。

## 目標
鹿野的案件管理系統：從場勘、報價、施工到完工，每個案子都是地圖上的一個點，狀態一目了然。
員工到工地時，用手機打開網址，跟著引導一步步填完資料。送出後產生一張案件卡片，標在彩色地圖上，我和員工都看得到所有工地的分布和狀態。

## 位置與架構
- 本機路徑：~/Projects/luye-site-radar
- GitHub：新建 repo dioddada/luye-site-radar，前端用 GitHub Pages 對外（HTTPS）
- 前端：純 HTML/CSS/JS，不需要 build，手機優先。地圖用 Leaflet + OpenStreetMap（免費）
- 後端：Google Apps Script Web App，資料存 Google 試算表，照片存 Google 雲端硬碟的資料夾
- Mac Studio 只用來開發，不當伺服器
- 前端不能放任何金鑰或密碼

## 登入（LINE LIFF）
- 用 LINE Login 頻道 + LIFF：liff.init → liff.login → 取得 ID token
- 每次呼叫 API 都附上 ID token，Apps Script 用 LINE 的 verify API 驗證
- 試算表開一個「Users」分頁：lineUserId、姓名、角色（admin/staff）、狀態（啟用/待審）
- 第一次登入的人一律是「待審」，要我在試算表裡核准才能用。我是 admin
- 權限：
  - staff 可以新增案件、修改自己填的案件、看全部地圖
  - admin 才能改狀態、刪除案件、填「下一步」欄位

## 引導式表單（一步一頁，上方顯示進度條）
### 步驟 1：定位與基本資料
- 自動抓經緯度（enableHighAccuracy），在地圖上顯示大頭針和精度圈
- 大頭針可以拖曳修正；有「重新定位」按鈕
- 可以貼上 Google 地圖或 LINE 位置的連結，自動解析出經緯度
- 用 Nominatim 反查地址，自動帶入、可以修改
- 「在 Google 地圖開啟」按鈕
- 欄位：客戶姓名（必填）、電話（必填，tel 鍵盤）
- 照片至少 1 張：可以開相機拍或從相簿選，上傳前先在手機端壓縮到長邊 1600px 的 JPEG

### 步驟 2：作業類型（兩顆大按鈕：新建／維修）
新建：
- 每一列填 長度(米)、寬度(米)、棟數，按「＋再新增一種尺寸」可以加一列，每列可以刪除
- 自動算出總面積，同時顯示平方米和坪（1坪=3.3058㎡）

維修：
- 現有溫室的長、寬、棟數（選填）
- 維修項目用多選打勾，不要用下拉選單：
  - 更換農膜：填「弧長(米)」和「長度(米)」
    弧長欄位旁邊要有紅字：「請填弧長（膜從一側地面跨過頂部到另一側地面的長度），不是溫室寬度」
    另外附一張 SVG 示意圖，畫出弧長和寬度的差別
    再加一個勾選框「現場沒量到，之後補」，勾了才能不填
  - 維修網子：單選 兩側／前後／四周
  - 更換 S 線
  - 更換捲揚
  - 更換黑繩
  - 其他：文字欄位

### 步驟 3：確認與送出
- 備註欄
- 摘要卡片預覽 → 送出 → 成功畫面
- 所有尺寸一律以「米」為單位，並在畫面上明確標示
- 填寫中的草稿自動存在 localStorage（用 try/catch 包起來），沒訊號時先排入佇列，有訊號再自動重送

## 資料欄位（試算表「Cases」分頁）
caseId、createdAt、createdBy（lineUserId、姓名）、customerName、phone、lat、lng、address、workType（new/repair）、buildings（JSON）、repair（JSON）、photos（雲端硬碟檔案 ID）、notes、status、statusUpdatedAt、nextAction、owner、dueDate

## 地圖頁（雷達主畫面）
- 依狀態顯示不同顏色的點：
  - 🟡 場勘／報價中（survey）
  - 🔵 施工中（building）
  - 🟢 完工（done）
  - ⚪ 放棄（dropped，預設隱藏）
- 黃點超過 7 天沒改狀態，就加一圈閃動的紅框
- 上方有狀態篩選按鈕和圖例，另外可以切換成「列表檢視」
- 點下圖釘，從下方滑出案件卡片，內容有：摘要、照片、「導航」按鈕（https://www.google.com/maps/dir/?api=1&destination=lat,lng）、「撥打電話」按鈕
- admin 在卡片上可以：改狀態、填下一步／負責人／期限

## 音效（Web Audio 即時合成，不要用任何遊戲的原始音檔）
- 切換選項：短促方波「嗶」（約 880Hz、40ms）
- 確認／下一步：低沉「咚」（220Hz 滑到 165Hz、約 120ms）
- 返回：下降音（660Hz 滑到 330Hz）
- 送出完成：上升三連音（523、659、784Hz）
- 點地圖圖釘：短「啵」
- 第一次觸控時才初始化 AudioContext
- 右上角放靜音鍵，設定要記住

## 介面
- 繁體中文
- 深色、科技感，風格像遊戲選單
- 按鈕至少 48px 高，方便戴手套或單手操作

## 交付
1. 程式碼推上 GitHub，開好 GitHub Pages
2. Apps Script 程式碼放在 /apps-script 資料夾
3. README 用一步一步的方式教我設定：建 LINE Login 頻道和 LIFF、建試算表、部署 Apps Script、填好 config.js
4. 放 3 筆測試資料（三種狀態各一筆）
5. 完成後給我手機測試網址和 LIFF 連結

## 第二版（這次不要做）
- 接 luye-greenhouse 報價引擎，自動產生估價單草稿
- 越南文介面
- 新案件與逾期案件的 LINE 推播
