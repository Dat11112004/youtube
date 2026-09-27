/**
 * YouTube Ad-Shield Pro - Popup Controller
 * Quản lý trạng thái giao diện, kiểm tra tab YouTube hiện tại, đồng bộ cài đặt và thống kê
 */

document.addEventListener('DOMContentLoaded', async () => {
  // Elements
  const btnClose = document.getElementById('btn-close-popup');
  const btnQuickActivate = document.getElementById('btn-quick-activate');
  const btnToggleSettings = document.getElementById('btn-toggle-settings');
  const settingsPanel = document.getElementById('settings-panel');
  const settingsArrow = document.getElementById('settings-arrow');

  const siteName = document.getElementById('site-name');
  const processingStatus = document.getElementById('processing-status');

  const toggleMaster = /** @type {HTMLInputElement} */ (document.getElementById('toggle-master'));
  const statusDot = document.getElementById('status-dot');
  const statusText = document.getElementById('status-text');
  const masterCard = document.querySelector('.master-card');

  const statSessionCount = document.getElementById('stat-session-count');
  const statTotalCount = document.getElementById('stat-total-count');
  const statTime = document.getElementById('stat-time');

  const toggleVideoAds = /** @type {HTMLInputElement} */ (document.getElementById('toggle-video-ads'));
  const toggleAntiAdblock = /** @type {HTMLInputElement} */ (document.getElementById('toggle-anti-adblock'));
  const toggleBackdrops = /** @type {HTMLInputElement} */ (document.getElementById('toggle-backdrops'));
  const toggleBanners = /** @type {HTMLInputElement} */ (document.getElementById('toggle-banners'));
  const toggleShorts = /** @type {HTMLInputElement} */ (document.getElementById('toggle-shorts'));

  const btnResetSession = document.getElementById('btn-reset-session');
  const btnResetAll = document.getElementById('btn-reset-all');

  // Format thời gian hiển thị gọn gàng
  function formatTime(seconds) {
    if (!seconds || seconds <= 0) return '0s';
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m`;
    const hours = (seconds / 3600).toFixed(1);
    return `${hours}h`;
  }

  // 1. Kiểm tra Tab hiện tại có phải là YouTube hay không
  async function checkCurrentTab() {
    if (typeof chrome === 'undefined' || !chrome.tabs || !chrome.tabs.query) {
      return;
    }

    try {
      const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!activeTab || !activeTab.url) return;

      const url = activeTab.url;
      const isYouTube = url.includes('youtube.com');

      if (isYouTube) {
        siteName.textContent = 'YouTube';
        siteName.className = 'site-badge';

        if (!toggleMaster.checked) {
          processingStatus.textContent = 'Đã tạm dừng bảo vệ';
          processingStatus.className = 'processing-badge inactive';
        } else if (url.includes('/watch')) {
          processingStatus.textContent = 'Đang tự động tua 16x & bỏ qua ads';
          processingStatus.className = 'processing-badge';
        } else if (url.includes('/shorts/')) {
          processingStatus.textContent = 'Đang tự động lướt qua Shorts tài trợ';
          processingStatus.className = 'processing-badge';
        } else {
          processingStatus.textContent = 'Sẵn sàng tự động xử lý khi mở video';
          processingStatus.className = 'processing-badge';
        }

        // Truy vấn trạng thái trực tiếp từ Content Script nếu có
        if (activeTab.id) {
          chrome.tabs.sendMessage(activeTab.id, { action: 'GET_TAB_STATUS' }, (res) => {
            if (chrome.runtime.lastError || !res) return;
            if (res.isAdActive && toggleMaster.checked) {
              processingStatus.textContent = '⚡ Đang xử lý quảng cáo trên video...';
            }
          });
        }
      } else {
        siteName.textContent = 'Khác';
        siteName.className = 'site-badge site-inactive';
        processingStatus.textContent = 'Không kích hoạt trên trang này (Chỉ YouTube)';
        processingStatus.className = 'processing-badge inactive';
      }
    } catch (e) {}
  }

  // 2. Cập nhật UI trạng thái Master
  function updateMasterUI(isActive) {
    toggleMaster.checked = isActive;
    if (isActive) {
      statusDot.className = 'dot dot-active';
      statusText.textContent = 'Active';
      statusText.style.color = '#f4f4f8';
      masterCard.classList.add('active');
      btnQuickActivate.innerHTML = '<span class="btn-icon">✓</span><span class="btn-text">Đang bảo vệ (Đóng bảng)</span>';
    } else {
      statusDot.className = 'dot dot-inactive';
      statusText.textContent = 'Inactive';
      statusText.style.color = '#9aa0b4';
      masterCard.classList.remove('active');
      btnQuickActivate.innerHTML = '<span class="btn-icon">⚡</span><span class="btn-text">Kích hoạt & Đóng ngay</span>';
    }
    checkCurrentTab();
  }

  // 3. Tải cài đặt ban đầu từ storage
  const settings = await getSettings();

  updateMasterUI(settings.masterEnabled !== false);
  toggleVideoAds.checked = settings.skipVideoAds !== false;
  toggleAntiAdblock.checked = settings.antiAdblock !== false;
  toggleBackdrops.checked = settings.removeBackdrops !== false;
  toggleBanners.checked = settings.hideBanners !== false;
  toggleShorts.checked = settings.blockShorts !== false;

  statSessionCount.textContent = (settings.sessionBlockedCount || 0).toLocaleString();
  statTotalCount.textContent = (settings.totalBlockedCount || 0).toLocaleString();
  statTime.textContent = formatTime(settings.timeSavedSeconds || 0);

  // 4. Sự kiện Đóng Popup (Esc hoặc nút close)
  btnClose.addEventListener('click', () => {
    window.close();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      window.close();
    }
  });

  // 5. Nút "Kích hoạt & Đóng ngay"
  btnQuickActivate.addEventListener('click', async () => {
    await saveSettings({ masterEnabled: true });
    updateMasterUI(true);

    btnQuickActivate.style.background = 'linear-gradient(135deg, #00e676 0%, #00b050 100%)';
    btnQuickActivate.innerHTML = '<span class="btn-icon">✓</span><span class="btn-text">Hoàn tất! Đang đóng...</span>';

    setTimeout(() => {
      window.close();
    }, 200);
  });

  // 6. Gạt công tắc Master
  toggleMaster.addEventListener('change', async () => {
    const isEnabled = toggleMaster.checked;
    updateMasterUI(isEnabled);
    await saveSettings({ masterEnabled: isEnabled });
  });

  // 7. Mở / Đóng ngăn Cài đặt nâng cao (Settings Drawer)
  btnToggleSettings.addEventListener('click', () => {
    const isCollapsed = settingsPanel.classList.contains('collapsed');
    if (isCollapsed) {
      settingsPanel.classList.remove('collapsed');
      settingsArrow.classList.add('rotated');
    } else {
      settingsPanel.classList.add('collapsed');
      settingsArrow.classList.remove('rotated');
    }
  });

  // 8. Các công tắc chi tiết
  toggleVideoAds.addEventListener('change', async () => {
    await saveSettings({ skipVideoAds: toggleVideoAds.checked });
  });

  toggleAntiAdblock.addEventListener('change', async () => {
    await saveSettings({ antiAdblock: toggleAntiAdblock.checked });
  });

  toggleBackdrops.addEventListener('change', async () => {
    await saveSettings({ removeBackdrops: toggleBackdrops.checked });
  });

  toggleBanners.addEventListener('change', async () => {
    await saveSettings({ hideBanners: toggleBanners.checked });
  });

  toggleShorts.addEventListener('change', async () => {
    await saveSettings({ blockShorts: toggleShorts.checked });
  });

  // 9. Đặt lại bộ đếm phiên (Reset)
  btnResetSession.addEventListener('click', async () => {
    await resetStats(false);
    statSessionCount.textContent = '0';
    if (chrome.runtime && chrome.runtime.sendMessage) {
      chrome.runtime.sendMessage({ action: 'RESET_STATS', resetTotal: false });
    }
  });

  // 10. Đặt lại toàn bộ số liệu
  btnResetAll.addEventListener('click', async () => {
    if (confirm('Bạn có chắc muốn đặt lại toàn bộ thống kê quảng cáo về 0?')) {
      await resetStats(true);
      statSessionCount.textContent = '0';
      statTotalCount.textContent = '0';
      statTime.textContent = '0s';
      if (chrome.runtime && chrome.runtime.sendMessage) {
        chrome.runtime.sendMessage({ action: 'RESET_STATS', resetTotal: true });
      }
    }
  });

  // 11. Cập nhật số liệu Real-Time khi có quảng cáo bị chặn trong lúc Popup đang mở
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.onChanged) {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'local') {
        if (changes.sessionBlockedCount) {
          statSessionCount.textContent = (changes.sessionBlockedCount.newValue || 0).toLocaleString();
        }
        if (changes.totalBlockedCount) {
          statTotalCount.textContent = (changes.totalBlockedCount.newValue || 0).toLocaleString();
        }
        if (changes.timeSavedSeconds) {
          statTime.textContent = formatTime(changes.timeSavedSeconds.newValue || 0);
        }
        if (changes.masterEnabled) {
          updateMasterUI(changes.masterEnabled.newValue !== false);
        }
      }
    });
  }
});
