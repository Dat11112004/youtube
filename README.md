# YouTube Ad-Shield Pro (v2.2.0)
### Production-Ready Chrome Extension Manifest V3 for YouTube

> **Extension chuyên dụng 100% cho YouTube**: Tự động phát hiện và xử lý quảng cáo video, banner và Shorts ngay khi người dùng bắt đầu xem hoặc chuyển video bằng YouTube SPA navigation; tích hợp **State Machine bảo vệ tuyệt đối Main Video**, zero CPU loop, không che khuất màn hình và bảo mật quyền riêng tư tối đa.

---

## 📑 Mục Lục
1. [Phân Tích Lỗi Gốc & Giải Pháp Sửa Triệt Để](#1-phân-tích-lỗi-gốc--giải-pháp-sửa-triệt-để)
2. [State Machine Bảo Vệ Main Video](#2-state-machine-bảo-vệ-main-video)
3. [Chrome APIs & Quyền Hạn Tối Thiểu (Minimal Permissions)](#3-chrome-apis--quyền-hạn-tối-thiểu)
4. [Cấu Trúc Thư Mục Chuẩn Production](#4-cấu-trúc-thư-mục-chuẩn-production)
5. [Giải Thích Chi Tiết Các Module](#5-giải-thích-chi-tiết-các-module)
6. [Hướng Dẫn Build & Chạy Test Suite](#6-hướng-dẫn-build--chạy-test-suite)
7. [Checklist Test Regression (Kiểm Tra Thực Tế)](#7-checklist-test-regression)
8. [Hướng Dẫn Cài Đặt (Developer Mode)](#8-hướng-dẫn-cài-đặt-developer-mode)

---

## 1. Phân Tích Lỗi Gốc & Giải Pháp Sửa Triệt Để

### Nguyên nhân khiến video chính bị tự động bỏ qua (Skip) ở phiên bản cũ:

1. **Lỗi can thiệp `currentTime` và `Event('ended')` trong `ad_processor.js`**:
   * *Nguyên nhân*: YouTube sử dụng **chính xác cùng một thẻ `<video>`** cho cả video quảng cáo và video chính của người dùng.
   * Khi quảng cáo kết thúc và YouTube bắt đầu nạp stream video chính, chu kỳ `timeupdate` hoặc `scheduleScan` trước đó vẫn kịp kích hoạt đoạn mã:
     ```javascript
     video.currentTime = video.duration - 0.1;
     video.dispatchEvent(new Event('ended'));
     ```
   * Hậu quả: Đoạn mã đã vô tình đẩy `currentTime` của **video chính** (ví dụ video dài 10 phút = 600s) lên 599.9s và phát sự kiện `ended`. YouTube hiểu nhầm là người dùng đã xem xong video, do đó lập tức kích hoạt Autoplay / Playlist chuyển sang video tiếp theo!
2. **Lỗi nhận diện False-Positive trong `ad_detector.js`**:
   * *Nguyên nhân*: Kiểm tra container `.video-ads:not(:empty)` hoặc `.ytp-ad-player-overlay` mà không ràng buộc chặt chẽ với class `ad-showing` / `ad-interrupting` của player. Trên thực tế, YouTube giữ lại khung wrapper `.video-ads` trong DOM cả khi video chính đang phát.
3. **Lỗi vòng lặp gọi `player.skipAd()` trong `inject.js`**:
   * *Nguyên nhân*: Vòng lặp `setInterval(..., 200)` trong Main World liên tục gọi `player.skipAd()`, dẫn đến xung đột race-condition ngay tại thời điểm giao thoa giữa ad và main video.
4. **Lỗi ép `video.play()` khi người dùng chủ động Pause**:
   * *Nguyên nhân*: Code cũ tự ý gọi `video.play()` khi khôi phục trạng thái, làm mất quyền kiểm soát playback của người dùng.

### Giải pháp kỹ thuật đã khắc phục:
* **LOẠI BỎ 100%**: Tuyệt đối không can thiệp vào `video.currentTime`, không phát sự kiện `ended`, không gọi `player.skipAd()` định kỳ.
* **Xử lý quảng cáo tự nhiên**: Chỉ tắt tiếng (`video.muted = true`) và tăng tốc độ phát lên `16.0x` trong thời gian ad chạy, kết hợp bấm nút Skip hợp lệ.
* **Khôi phục nguyên bản**: Khi ad kết thúc, hoàn trả `playbackRate` về tốc độ người dùng đã chọn (1.0x, 1.25x...) và chỉ bật lại âm thanh nếu người dùng không chủ động mute từ trước. Giữ nguyên trạng thái Pause nếu người dùng đang pause.

---

## 2. State Machine Bảo Vệ Main Video

Hệ thống quản lý trạng thái player nghiêm ngặt qua 4 trạng thái, **tuyệt đối không có flow sang NEXT VIDEO**:

```text
       [ Khởi động trang / Chuyển URL ]
                      │
                      ▼
                   ┌──────┐
                   │ IDLE │
                   └──┬───┘
                      │ Player sẵn sàng
                      ▼
            ┌────────────────────┐
            │ MAIN_VIDEO_PLAYING │◄──────────────────────────────┐
            └─────────┬──────────┘                               │
                      │ Phát hiện ad-showing                     │
                      ▼                                          │
         ┌────────────────────────┐                              │
         │ ADVERTISEMENT_DETECTED │                              │
         │  - Mute tiếng          │                              │
         │  - Tốc độ 16x          │                              │
         │  - Click nút Skip      │                              │
         └────────────┬───────────┘                              │
                      │ ad-showing biến mất                      │
                      ▼                                          │
          ┌───────────────────────┐                              │
          │ ADVERTISEMENT_HANDLED │                              │
          │  - Khôi phục tốc độ   │                              │
          │  - Khôi phục âm lượng ├──────────────────────────────┘
          │  - BẢO TOÀN VIDEO     │
          └───────────────────────┘
```

### Hệ Thống Logging Minh Bạch:
Mọi hành động can thiệp đều xuất log kèm lý do chi tiết:
```text
[YT-ADBLOCK] Main video detected (Video ID: ...)
[YT-ADBLOCK] Advertisement detected (Muting ad audio and accelerating ad playback to 16x)
[YT-ADBLOCK] Clicking ad skip button (Dispatching click on verified skip element)
[YT-ADBLOCK] Advertisement handled (Ad finished, restoring normal playback settings)
[YT-ADBLOCK] Main video preserved (Restored speed: 1.0x, unmuted: true)
[YT-ADBLOCK] YouTube navigation detected (URL: ...)
```

---

## 3. Chrome APIs & Quyền Hạn Tối Thiểu

Extension áp dụng nguyên tắc **Least Privilege** theo chuẩn Chrome Web Store Policy:

| Quyền hạn | Lý do sử dụng |
| :--- | :--- |
| `host_permissions: ["https://*.youtube.com/*", "https://youtube.com/*"]` | **Chỉ giới hạn trên YouTube**, tuyệt đối không can thiệp website khác. |
| `permissions: ["storage"]` | Lưu cài đặt của người dùng và số lượng quảng cáo đã xử lý theo phiên. |
| `permissions: ["declarativeNetRequest"]` | Khóa các request ping tracking quảng cáo của YouTube ở tầng mạng (`rules/dnr_rules.json`). |
| **Không dùng** `<all_urls>` | Bảo vệ tối đa quyền riêng tư của người dùng. |
| **Không dùng** `tabs`, `cookies`, `webRequestBlocking` | Không thu thập dữ liệu nhạy cảm hoặc làm chậm trình duyệt. |

---

## 4. Cấu Trúc Thư Mục Chuẩn Production

```
d:\youtube\
├── manifest.json                     # Cấu hình Manifest V3
├── package.json                      # Scripts: test, validate, build
├── tsconfig.json                     # Cấu hình TypeScript checking cho toàn dự án
├── README.md                         # Tài liệu kiến trúc toàn diện
├── rules\
│   └── dnr_rules.json                # Quy tắc Declarative Net Request
├── scripts\
│   └── validate.js                   # Script kiểm tra cú pháp và tính toàn vẹn
├── tests\                            # Bộ kiểm thử tự động toàn diện
│   ├── run_tests.js                  # Master test runner
│   ├── test_manifest.js              # Kiểm tra cấu hình và minimal permissions
│   ├── test_storage.js               # Kiểm tra cài đặt và session/total stats
│   ├── test_rules_and_detector.js    # Kiểm tra phân biệt main video và ad
│   ├── test_processor.js             # Kiểm tra an toàn: cấm currentTime, kết thúc êm
│   ├── test_navigation.js            # Kiểm tra SPA navigation & History API
│   └── test_popup_dom.js             # Kiểm tra các thành phần giao diện popup
├── icons\
│   ├── icon16.png                    # Icon 16x16
│   ├── icon48.png                    # Icon 48x48
│   └── icon128.png                   # Icon 128x128
└── src\
    ├── types\
    │   └── index.d.ts                # TypeScript interfaces & types
    ├── utils\
    │   ├── logger.js                 # Tiện ích logging [YT-ADBLOCK]
    │   ├── dom.js                    # Thao tác DOM, visibility check, dispatch event
    │   └── storage.js                # Quản lý chrome.storage & stats
    ├── content\
    │   ├── detection\
    │   │   ├── rules.js              # Registry selectors & quy tắc nhận diện
    │   │   └── ad_detector.js        # Module PHÁT HIỆN: Phân biệt Main Video vs Ad
    │   ├── processing\
    │   │   └── ad_processor.js       # Module XỬ LÝ: Mute, 16x, Click Skip, Bảo vệ video
    │   ├── navigation\
    │   │   └── navigation_watcher.js # Module SPA Navigation: Chuyển trang, bảo toàn hook
    │   ├── content_main.js           # Content Orchestrator: State Machine quản lý player
    │   ├── content.css               # Declarative CSS ẩn banner & popup cảnh báo
    │   └── inject.js                 # Main World: Lọc metadata playerResponse tầng sâu
    ├── background\
    │   └── service_worker.js         # Service Worker quản lý badge & thống kê phiên
    └── popup\
        ├── popup.html                # Popup UI: Website, Status, Session Count, Reset
        ├── popup.css                 # Dark Glassmorphism styles
        └── popup.js                  # Controller Popup
```

---

## 5. Giải Thích Chi Tiết Các Module

### 1. `src/content/detection/ad_detector.js`
* **Xác thực 2 tầng**: Để xác định là quảng cáo, bắt buộc Player phải có class `ad-showing` / `ad-interrupting` hoặc `getAdState() > 0`, kết hợp với phần tử quảng cáo hiển thị thực tế.
* Nếu không có các dấu hiệu trên, trả về `false` ngay lập tức ➔ **Xác định 100% là Main Video**.
* **Loại trừ nút điều khiển**: Hàm `isValidSkipButton()` chủ động loại trừ các nút `.ytp-next-button`, `.ytp-prev-button`, `.ytp-play-button` và `ytp-autonav-toggle-button` để tránh click nhầm.

### 2. `src/content/processing/ad_processor.js`
* Ghi nhớ tốc độ phát và trạng thái âm lượng ban đầu của người dùng (`userPlaybackRate`, `userWasMuted`).
* Tắt tiếng và đẩy tốc độ lên 16x chỉ trong lúc có quảng cáo.
* Khi quảng cáo kết thúc, trả lại đúng tốc độ và âm lượng cũ.
* **Tuyệt đối không đụng vào `currentTime` hay `ended` event**.

### 3. `src/content/content_main.js`
* Điều phối State Machine: Duy trì trạng thái `MAIN_VIDEO_PLAYING`. Khi ở trạng thái này, không có bất kỳ can thiệp nào lên player.
* Lắng nghe trực tiếp `timeupdate` của video để bắt mid-roll ads ngay tức khắc.

### 4. `src/content/inject.js`
* Lọc sạch `adPlacements` và `playerAds` từ tầng phản hồi mạng `fetch('/youtubei/v1/player')`.
* Đã gỡ bỏ hoàn toàn `setInterval` gọi `skipAd()` định kỳ để tránh race condition.

---

## 6. Hướng Dẫn Build & Chạy Test Suite

Dự án cung cấp bộ test tự động kiểm thử toàn bộ 6 tầng:

1. **Chạy toàn bộ Test Suite**:
   ```powershell
   npm test
   ```
   *Kết quả thực tế*:
   ```text
   ====================================================
   🚀 RUNNING AUTOMATED TEST SUITE: YouTube Ad-Shield Pro
   ====================================================

   Testing manifest.json configuration...
   ✅ manifest.json passed all security and specification checks.

   Testing storage.js...
   ✅ storage.js passed all unit tests.

   Testing rules.js and ad_detector.js...
   ✅ rules.js and ad_detector.js passed all unit tests.

   Testing ad_processor.js (Safety & Non-Destructive Mode)...
   ✅ ad_processor.js passed all safety & non-destructive unit tests.

   Testing navigation_watcher.js...
   ✅ navigation_watcher.js passed all unit tests.

   Testing popup.html DOM structure...
   ✅ popup.html DOM structure passed all requirement checks.

   ====================================================
   🎉 ALL 6 TEST SUITES PASSED 100% SUCCESSFULLY!
   ✨ The extension is verified, robust, and production-ready.
   ====================================================
   ```

2. **Kiểm tra tính toàn vẹn tài nguyên**:
   ```powershell
   npm run validate
   ```

---

## 7. Checklist Test Regression

Sau khi nạp extension vào Chrome, thực hiện kiểm tra các kịch bản sau:

- [x] **Mở video bình thường**: Video phát từ đầu đến cuối mà không bị can thiệp.
- [x] **Video có quảng cáo đầu video (Pre-roll)**: Quảng cáo được tua 16x và skip tự động, video chính tiếp tục phát bình thường từ giây 0:00.
- [x] **Quảng cáo giữa video (Mid-roll)**: Khi có ad xen giữa, ad được xử lý nhanh và video chính tiếp tục phát đúng mốc thời gian đang xem, không bị nhảy video.
- [x] **Chuyển sang video khác bằng click chuột**: Bấm vào video liên quan ở cột bên phải, video mới phát bình thường, không tự skip.
- [x] **YouTube SPA Navigation**: Chuyển bài trong Playlist, bài tiếp theo phát đúng từ đầu mà không bị nhảy cóc qua bài khác.
- [x] **Reload trang (`F5`)**: Video tải lại và phát ổn định.
- [x] **Mở video trong tab mới**: Tab mới tự động kích hoạt bảo vệ và phát video chính xác.
- [x] **Video không có quảng cáo**: Console hiển thị `[YT-ADBLOCK] Main video preserved`, không có bất kỳ can thiệp nào vào player.
- [x] **Người dùng tự tạm dừng (Pause)**: Bấm Pause trên video, tiện ích không tự ý kích hoạt `play()` trở lại.
- [x] **Người dùng tự tua thanh thời gian**: Bấm tua tùy ý trên thanh timeline, tiện ích không can thiệp hay hoàn tác.
- [x] **Bật/Tắt công tắc trên Popup**: Bấm tắt/bật Master Switch trên popup, video hiện tại vẫn giữ nguyên trạng thái xem.

---

## 8. Hướng Dẫn Cài Đặt (Developer Mode)

1. Mở Google Chrome (hoặc Edge, Brave, Cốc Cốc) và truy cập URL: `chrome://extensions`
2. Bật công tắc **"Chế độ dành cho nhà phát triển" (Developer mode)** ở góc trên bên phải.
3. Nhấn nút **"Tải tiện ích đã giải nén" (Load unpacked)** ở góc trên bên trái.
4. Điều hướng và chọn thư mục: `d:\youtube`
5. Mở [YouTube](https://www.youtube.com), mở Console (`F12`) để theo dõi các log `[YT-ADBLOCK]` trực quan và thưởng thức video trọn vẹn!
