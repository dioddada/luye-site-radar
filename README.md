# 鹿野工地雷達（luye-site-radar）

手機引導式填案件 → 彩色地圖顯示所有工地狀態。

- 網址：https://dioddada.github.io/luye-site-radar/
- 先看畫面（測試模式，不用登入，資料只存在你這支手機）：https://dioddada.github.io/luye-site-radar/?mock=1
- 規格：[SPEC.md](SPEC.md)　決定紀錄：[DECISIONS.md](DECISIONS.md)

## 架構

| 部分 | 用什麼 | 放哪 |
|---|---|---|
| 前端 | 純 HTML/CSS/JS＋Leaflet＋OpenStreetMap | 這個 repo，GitHub Pages |
| 登入 | LINE Login 頻道＋LIFF | LINE Developers |
| 後端 | Google Apps Script 網頁應用程式 | `apps-script/` 的程式貼到 script.google.com |
| 資料 | Google 試算表（Users、Cases 分頁） | 你的雲端硬碟（setup 自動建） |
| 照片 | Google 雲端硬碟資料夾（私人） | 你的雲端硬碟（setup 自動建） |

前端沒有任何密碼或金鑰。`js/config.js` 只放 LIFF ID 和後端網址，這兩個都可以公開。

---

## 設定步驟（照順序做，約 30 分鐘）

### 第 1 步：建 LINE Login 頻道和 LIFF

1. 用電腦打開 https://developers.line.biz/console/ ，用你的 LINE 帳號登入。
2. 建一個 **Provider**（已經有鹿野的就直接點進去）。名稱例如「鹿野溫室」。
3. 按 **Create a new channel** → 選 **LINE Login**。
   - Region：Taiwan
   - Channel name：鹿野工地雷達
   - Channel description：工地案件管理
   - App types：勾 **Web app**
   - Email：填你的信箱
   - 勾同意條款 → **Create**
4. 進到頻道，**Basic settings** 分頁往下找 **Channel ID**（一串數字），抄下來 → 第 2 步要用。
5. 切到 **LIFF** 分頁 → **Add**：
   - LIFF app name：鹿野工地雷達
   - Size：**Full**
   - Endpoint URL：`https://dioddada.github.io/luye-site-radar/`
   - Scopes：勾 **openid** 和 **profile**
   - Bot link feature：Off
   - 其他不用動 → **Add**
6. 建好後會看到 **LIFF ID**（像 `2001234567-AbCdEfGh`）和 **LIFF URL**（`https://liff.line.me/…`），抄下來 → 第 3 步要用。
7. 頻道頁面最上面狀態是 **Developing** 時，只有你自己能登入。員工要用之前，點它改成 **Published**。

### 第 2 步：建後端（Apps Script）＋試算表

1. 用你平常的 Gmail 打開 https://script.google.com → **新專案**。左上角把名稱改成「鹿野工地雷達」。
2. 打開本 repo 的 [`apps-script/Code.gs`](apps-script/Code.gs)，按「Raw」後全選複製，貼進編輯器的 `程式碼.gs`（把原本內容全部蓋掉）。按 💾 儲存。
3. 左邊 ⚙️ **專案設定**：
   - 勾 **「在編輯器中顯示『appsscript.json』資訊清單檔案」**。
   - 往下到 **指令碼屬性** → **新增指令碼屬性**：
     - 屬性：`LINE_CHANNEL_ID`　值：第 1 步抄的 Channel ID
   - 儲存。
4. 回到編輯器，點左邊的 `appsscript.json`，把內容換成本 repo 的 [`apps-script/appsscript.json`](apps-script/appsscript.json)，儲存。
5. 上方函式選單選 **setup** → **執行**。
   - 跳出「需要授權」→ 選你的帳號 → 「Google 尚未驗證這個應用程式」→ **進階** → **前往「鹿野工地雷達」（不安全）** → **允許**。（這是你自己寫給自己用的程式，所以會這樣顯示）
   - 下方「執行記錄」會印出試算表和照片資料夾的網址。試算表叫「鹿野工地雷達 資料庫」，在你的雲端硬碟根目錄。
6. 函式選單選 **seedTestData** → **執行**，會放入 3 筆測試案件（場勘／施工／完工各一）。
7. 右上 **部署** → **新增部署作業**：
   - 左邊齒輪選 **網頁應用程式**
   - 說明：v1
   - 執行身分：**我**
   - 誰可以存取：**所有人**
   - **部署** → 複製 **網頁應用程式網址**（`https://script.google.com/macros/s/…/exec`）→ 第 3 步要用。

> 「所有人」是指網址能被呼叫，但每次呼叫都要帶 LINE 登入憑證，而且要你核准過才拿得到資料。

**之後改了 Apps Script 程式碼要更新：** 貼上新的 `Code.gs` → 儲存 → 函式選單選 **setup** 再執行一次（會在 Cases 表尾補上新欄位，不動舊資料）→ 部署 → 管理部署作業 → ✏️ 編輯 → 版本選「新版本」→ 部署。網址不會變。

> 2026-11-23 起 Cases 表尾多一欄 `materials`（新建的四周／屋頂材料）。已經跑過 setup 的試算表，照上面重跑 setup 就會補上；再跑一次 seedTestData 會幫舊的測試資料補上材料。

### 第 3 步：填 config.js

最簡單：把 **LIFF ID** 和 **網頁應用程式網址** 傳給 Radar，我幫你填好推上去。

自己改的話：
1. 打開 https://github.com/dioddada/luye-site-radar/blob/main/js/config.js → 右上 ✏️。
2. 填入：
   ```js
   LIFF_ID: '2001234567-AbCdEfGh',
   API_URL: 'https://script.google.com/macros/s/……/exec',
   ```
3. **Commit changes**。約 1 分鐘後網站就更新了。

### 第 4 步：第一次登入，把自己設成管理員

1. 在手機 LINE 裡打開第 1 步的 **LIFF URL**（可以傳給自己再點）。
2. 第一次會要你同意授權，按允許 → 畫面顯示「等待核准」。
3. 打開試算表「鹿野工地雷達 資料庫」→ **Users** 分頁，找到你那一列：
   - 角色：改成 **admin**
   - 狀態：改成 **啟用**
4. 回到 LINE 畫面按 **重新檢查** → 看到地圖和 3 筆測試案件就成功了。

### 第 5 步：給員工用

1. 把 **LIFF URL** 傳給員工（私訊，不要發到群組也可以）。
2. 員工打開登入後，會出現在 Users 分頁，狀態是「待審」。
3. 你把他的狀態改成 **啟用**（角色維持 staff）就可以用了。

測試資料不需要了，直接在試算表 Cases 分頁刪掉 `TEST-001～003` 那三列即可。

---

## 權限

| | staff（員工） | admin（你） |
|---|---|---|
| 看全部地圖 | ✅ | ✅ |
| 新增案件 | ✅ | ✅ |
| 修改案件內容 | 只有自己填的、而且還在「場勘／報價中」 | 全部 |
| 改狀態、下一步、負責人、期限 | ❌ | ✅ |
| 刪除案件 | ❌ | ✅ |

## 使用說明

- **地圖顏色**：🟡 場勘／報價中　🔵 施工中　🟢 完工　⚪ 放棄（預設隱藏，點上方按鈕切換）
- **閃紅框**：黃點超過 7 天沒改狀態
- **點圖釘**：下方滑出案件卡片，有導航、撥電話、3D 爆炸圖、照片；管理員可以改狀態
- **3D 爆炸圖**：單指旋轉、雙指縮放，右下「合起／爆開」切換。維修＝要換的部件會亮橘色；新建＝照勾選的四周／屋頂材料分層爆開（第一次要有網路載入 3D）
- **右下 ◎**：地圖飛回你現在的位置
- **新建材料**：四周（黑網／捲揚／農膜／防蟲網）、屋頂（農膜／帆布／針織網／遮陰網），可複選
- **左下 ☰ 列表**：切換成列表，逾期的排最前面
- **沒訊號**：照常填，送出會排入佇列（右上 ⏳ 顯示筆數），有訊號自動補送
- **右上 🔊**：靜音開關，會記住
- **單位**：所有尺寸一律「米」。口頭說「尺」是台尺，1 尺 = 0.303 米

## 測試模式

網址後面加 `?mock=1`，不用登入、不連後端，資料只存在那支手機：

- `?mock=1`：管理員視角
- `?mock=1&role=staff`：員工視角
- `?mock=1&pending=1`：待審畫面
- `?mock=1&offline=1`：模擬沒訊號（送出會進佇列；拿掉 `offline` 重開就會補送）

## 檔案

```
index.html          畫面骨架
css/style.css       深色科技風樣式
js/config.js        LIFF ID、後端網址（非機密）
js/app.js           進入點、畫面切換、離線佇列
js/api.js           LIFF 登入、呼叫後端、佇列、測試模式
js/mapview.js       地圖、篩選、列表、案件卡片
js/form.js          三步驟引導表單
js/greenhouse3d.js  案件卡片的溫室 3D 爆炸圖（Three.js，CDN）
js/sound.js         Web Audio 合成音效
js/util.js          共用工具
apps-script/        後端程式（貼到 script.google.com）
```
