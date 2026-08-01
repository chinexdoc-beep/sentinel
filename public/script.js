document.addEventListener('DOMContentLoaded', () => {
  const authScreen = document.getElementById('authScreen');
  const appScreen = document.getElementById('appScreen');

  const loginTab = document.getElementById('loginTab');
  const signupTab = document.getElementById('signupTab');
  const loginForm = document.getElementById('loginForm');
  const signupForm = document.getElementById('signupForm');
  const signupRole = document.getElementById('signupRole');
  const authorityFields = document.getElementById('authorityFields');

  // Password Reset Elements
  const forgotPasswordModal = document.getElementById('forgotPasswordModal');
  const openForgotPassword = document.getElementById('openForgotPassword');
  const closeForgotModal = document.getElementById('closeForgotModal');
  const requestTokenForm = document.getElementById('requestTokenForm');
  const resetPasswordForm = document.getElementById('resetPasswordForm');

  const reportForm = document.getElementById('reportForm');
  const reportsList = document.getElementById('reportsList');
  const filterCategory = document.getElementById('filterCategory');
  const searchInput = document.getElementById('searchInput');
  const useGPSBtn = document.getElementById('useGPSBtn');
  const voiceMicBtn = document.getElementById('voiceMicBtn');

  // Direct Live Camera Modal Elements
  const startLiveCameraBtn = document.getElementById('startLiveCameraBtn');
  const cameraModal = document.getElementById('cameraModal');
  const cameraFeed = document.getElementById('cameraFeed');
  const cameraCanvas = document.getElementById('cameraCanvas');
  const capturePhotoBtn = document.getElementById('capturePhotoBtn');
  const closeCameraModalBtn = document.getElementById('closeCameraModalBtn');

  // Standard Upload File Elements
  const fileInput = document.getElementById('imageInput');
  const imagePreviewContainer = document.getElementById('imagePreviewContainer');
  const imagePreview = document.getElementById('imagePreview');
  const imageFileName = document.getElementById('imageFileName');

  let reports = [];
  let currentUser = JSON.parse(localStorage.getItem('sentinel_user')) || null;
  let token = localStorage.getItem('sentinel_token') || null;
  let activeImageData = '';
  let mediaStream = null;
  let pollingTimer = null; // REAL-TIME POLLING HANDLE

  let map = null, userSelectedMarker = null, reportMarkers = [];
  let defaultCoords = [9.0765, 7.3986];

  // AUTH TABS
  if (loginTab && signupTab) {
    loginTab.addEventListener('click', () => {
      loginTab.classList.add('active');
      signupTab.classList.remove('active');
      if (loginForm) loginForm.classList.remove('hidden');
      if (signupForm) signupForm.classList.add('hidden');
    });

    signupTab.addEventListener('click', () => {
      signupTab.classList.add('active');
      loginTab.classList.remove('active');
      if (signupForm) signupForm.classList.remove('hidden');
      if (loginForm) loginForm.classList.add('hidden');
    });
  }

  if (signupRole) {
    signupRole.addEventListener('change', (e) => {
      if (authorityFields) {
        authorityFields.classList.toggle('hidden', e.target.value !== 'authority');
      }
    });
  }

  // FORGOT & RESET PASSWORD CONTROLLERS
  if (openForgotPassword) {
    openForgotPassword.addEventListener('click', (e) => {
      e.preventDefault();
      if (forgotPasswordModal) forgotPasswordModal.classList.remove('hidden');
      if (requestTokenForm) requestTokenForm.classList.remove('hidden');
      if (resetPasswordForm) resetPasswordForm.classList.add('hidden');
    });
  }

  if (closeForgotModal) {
    closeForgotModal.addEventListener('click', () => {
      if (forgotPasswordModal) forgotPasswordModal.classList.add('hidden');
    });
  }

  if (requestTokenForm) {
    requestTokenForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const emailInput = document.getElementById('resetEmail');
      const email = emailInput ? emailInput.value.trim() : '';

      try {
        const res = await fetch('/api/auth/forgot-password', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email })
        });
        const data = await res.json();

        if (res.ok) {
          const resetTokenField = document.getElementById('resetTokenInput');
          if (resetTokenField && data.resetToken) {
            resetTokenField.value = data.resetToken;
          }
          showToast('🔑 Token generated! Switching to reset form...');
          requestTokenForm.classList.add('hidden');
          if (resetPasswordForm) resetPasswordForm.classList.remove('hidden');
        } else {
          showToast(`❌ ${data.error || 'Request failed'}`);
        }
      } catch (err) {
        showToast('❌ Failed to request reset token.');
      }
    });
  }

  if (resetPasswordForm) {
    resetPasswordForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const tokenInput = document.getElementById('resetTokenInput');
      const passwordInput = document.getElementById('newPasswordInput');
      
      const tokenVal = tokenInput ? tokenInput.value.trim() : '';
      const newPassword = passwordInput ? passwordInput.value.trim() : '';

      try {
        const res = await fetch('/api/auth/reset-password', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: tokenVal, newPassword })
        });
        const data = await res.json();

        if (res.ok) {
          showToast('✅ Password updated successfully! You can now log in.');
          if (forgotPasswordModal) forgotPasswordModal.classList.add('hidden');
          resetPasswordForm.reset();
          if (requestTokenForm) requestTokenForm.reset();
        } else {
          showToast(`❌ ${data.error || 'Reset failed'}`);
        }
      } catch (err) {
        showToast('❌ Password reset failed.');
      }
    });
  }

  checkAuthAndRenderScreen();

  function checkAuthAndRenderScreen() {
    if (token && currentUser) {
      if (authScreen) authScreen.classList.add('hidden');
      if (appScreen) appScreen.classList.remove('hidden');
      renderAuthNav();

      setTimeout(() => {
        if (!map) initMap();
        fetchReports();
      }, 200);

      // REAL-TIME UPDATES: Enable periodic polling every 10 seconds
      if (!pollingTimer) {
        pollingTimer = setInterval(fetchReports, 10000);
      }
    } else {
      if (authScreen) authScreen.classList.remove('hidden');
      if (appScreen) appScreen.classList.add('hidden');

      // Clear polling timer on logout
      if (pollingTimer) {
        clearInterval(pollingTimer);
        pollingTimer = null;
      }
    }
  }

  // CATEGORY BUTTON SELECTOR
  window.selectCategory = (buttonElement, categoryValue) => {
    document.querySelectorAll('.category-btn').forEach(btn => btn.classList.remove('active'));
    buttonElement.classList.add('active');
    const categoryField = document.getElementById('selectedCategory');
    if (categoryField) categoryField.value = categoryValue;
    showToast(`Selected: ${categoryValue}`);
  };

  // DIRECT CAMERA CONTROLLERS (HTML5 MediaDevices API)
  if (startLiveCameraBtn) {
    startLiveCameraBtn.addEventListener('click', async () => {
      try {
        mediaStream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
          audio: false
        });
        if (cameraFeed) cameraFeed.srcObject = mediaStream;
        if (cameraModal) cameraModal.classList.remove('hidden');
      } catch (err) {
        showToast("❌ Could not open camera. Check permissions or pick a file.");
        console.error("Camera access error:", err);
      }
    });
  }

  function stopCameraStream() {
    if (mediaStream) {
      mediaStream.getTracks().forEach(track => track.stop());
      mediaStream = null;
    }
    if (cameraModal) cameraModal.classList.add('hidden');
  }

  if (closeCameraModalBtn) {
    closeCameraModalBtn.addEventListener('click', stopCameraStream);
  }

  if (capturePhotoBtn) {
    capturePhotoBtn.addEventListener('click', () => {
      if (!cameraFeed || !cameraFeed.videoWidth) return;

      cameraCanvas.width = cameraFeed.videoWidth;
      cameraCanvas.height = cameraFeed.videoHeight;
      const ctx = cameraCanvas.getContext('2d');
      ctx.drawImage(cameraFeed, 0, 0, cameraCanvas.width, cameraCanvas.height);

      activeImageData = cameraCanvas.toDataURL('image/jpeg', 0.8);
      if (imagePreview) imagePreview.src = activeImageData;
      if (imageFileName) imageFileName.textContent = `📷 Live Snapshot attached (${new Date().toLocaleTimeString()})`;
      if (imagePreviewContainer) imagePreviewContainer.classList.remove('hidden');

      stopCameraStream();
      showToast("✅ Photo captured!");
    });
  }

  // FILE UPLOAD PROCESSOR
  if (fileInput) {
    fileInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (event) => {
        activeImageData = event.target.result;
        if (imagePreview) imagePreview.src = activeImageData;
        if (imageFileName) imageFileName.textContent = `📁 File attached: ${file.name}`;
        if (imagePreviewContainer) imagePreviewContainer.classList.remove('hidden');
      };
      reader.readAsDataURL(file);
    });
  }

  // SIGNUP
  if (signupForm) {
    signupForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const payload = {
        name: document.getElementById('signupName')?.value || '',
        email: document.getElementById('signupEmail')?.value || '',
        password: document.getElementById('signupPassword')?.value || '',
        role: signupRole ? signupRole.value : 'citizen',
        agencyName: document.getElementById('signupAgency')?.value || '',
        secretKey: document.getElementById('signupPasskey')?.value || ''
      };

      try {
        const res = await fetch('/api/auth/signup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (res.ok) {
          saveSession(data);
          showToast('✅ Account created successfully!');
        } else {
          showToast(`❌ ${data.error || 'Signup failed'}`);
        }
      } catch (err) {
        showToast('❌ Connection error.');
      }
    });
  }

  // LOGIN
  if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const payload = {
        email: document.getElementById('loginEmail')?.value || '',
        password: document.getElementById('loginPassword')?.value || ''
      };

      try {
        const res = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (res.ok) {
          saveSession(data);
          showToast('✅ Welcome back!');
        } else {
          showToast(`❌ ${data.error || 'Login failed'}`);
        }
      } catch (err) {
        showToast('❌ Connection error.');
      }
    });
  }

  function saveSession(data) {
    token = data.token;
    currentUser = data.user;
    localStorage.setItem('sentinel_token', token);
    localStorage.setItem('sentinel_user', JSON.stringify(currentUser));
    checkAuthAndRenderScreen();
  }

  function handleUnauthorized() {
    localStorage.removeItem('sentinel_token');
    localStorage.removeItem('sentinel_user');
    token = null;
    currentUser = null;
    checkAuthAndRenderScreen();
    showToast('🔒 Session expired. Please log in again.');
  }

  function renderAuthNav() {
    const authNav = document.getElementById('authNav');
    if (authNav && currentUser) {
      authNav.innerHTML = `
        <div style="display:flex; align-items:center; gap: 1rem;">
          <span style="font-size: 0.9rem;">👤 ${escapeHTML(currentUser.name)} (${currentUser.role.toUpperCase()})</span>
          <button id="logoutBtn" style="background:#334155; color:white; border:none; padding:0.4rem 0.8rem; border-radius:6px; cursor:pointer;">Logout</button>
        </div>
      `;
      const logoutBtn = document.getElementById('logoutBtn');
      if (logoutBtn) {
        logoutBtn.onclick = () => {
          localStorage.removeItem('sentinel_token');
          localStorage.removeItem('sentinel_user');
          token = null;
          currentUser = null;
          checkAuthAndRenderScreen();
          showToast('Logged out.');
        };
      }
    }
  }

  // MAP INIT
  function initMap() {
    const mapElement = document.getElementById('map');
    if (!mapElement) return;

    map = L.map('map').setView(defaultCoords, 11);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors'
    }).addTo(map);

    map.on('click', (e) => {
      const { lat, lng } = e.latlng;
      setFormCoordinates(lat, lng);

      if (userSelectedMarker) {
        userSelectedMarker.setLatLng(e.latlng);
      } else {
        userSelectedMarker = L.marker(e.latlng, { draggable: true }).addTo(map)
          .bindPopup("📍 <b>Selected Incident Location</b>").openPopup();
      }
    });
  }

  function setFormCoordinates(lat, lng) {
    const latInput = document.getElementById('latitude');
    const lngInput = document.getElementById('longitude');
    if (latInput) latInput.value = lat;
    if (lngInput) lngInput.value = lng;
    
    const locInput = document.getElementById('location');
    if (locInput && (!locInput.value || locInput.value.includes('Pinned Coords:'))) {
      locInput.value = `Pinned Coords: (${lat.toFixed(4)}, ${lng.toFixed(4)})`;
    }
  }

  // GPS BUTTON
  if (useGPSBtn) {
    useGPSBtn.addEventListener('click', () => {
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            const { latitude, longitude } = pos.coords;
            if (map) map.setView([latitude, longitude], 14);
            setFormCoordinates(latitude, longitude);

            if (userSelectedMarker) {
              userSelectedMarker.setLatLng([latitude, longitude]);
            } else if (map) {
              userSelectedMarker = L.marker([latitude, longitude]).addTo(map);
            }
            if (userSelectedMarker) {
              userSelectedMarker.bindPopup("🎯 <b>Your Current GPS Location</b>").openPopup();
            }
            showToast("🎯 GPS location acquired!");
          },
          () => showToast("❌ GPS access denied.")
        );
      }
    });
  }

  // WEB SPEECH VOICE ENGINE
  if (voiceMicBtn) {
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      const recognition = new SpeechRecognition();

      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.lang = 'en-US';

      voiceMicBtn.addEventListener('click', () => {
        if (voiceMicBtn.classList.contains('listening')) {
          recognition.stop();
        } else {
          recognition.start();
        }
      });

      recognition.onstart = () => {
        voiceMicBtn.classList.add('listening');
        voiceMicBtn.textContent = '🛑 Listening... Speak Now';
        showToast('🎙️ Voice recorder active. Speak your report details...');
      };

      recognition.onresult = (event) => {
        const transcript = event.results[0][0].transcript;
        const descField = document.getElementById('description');
        if (descField) {
          descField.value = descField.value ? `${descField.value} ${transcript}` : transcript;
        }
        showToast('✅ Voice transcribed successfully!');
      };

      recognition.onerror = (event) => {
        showToast(`❌ Voice recognition error: ${event.error}`);
        voiceMicBtn.classList.remove('listening');
        voiceMicBtn.textContent = '🎙️ Speak Details';
      };

      recognition.onend = () => {
        voiceMicBtn.classList.remove('listening');
        voiceMicBtn.textContent = '🎙️ Speak Details';
      };
    } else {
      voiceMicBtn.style.display = 'none';
    }
  }

  // SUBMIT REPORT
  if (reportForm) {
    reportForm.addEventListener('submit', (e) => {
      e.preventDefault();

      const selectedCatElem = document.getElementById('selectedCategory');
      const selectedCategory = selectedCatElem ? selectedCatElem.value : 'General Emergency';
      
      const userTitle = document.getElementById('title')?.value.trim() || '';
      const userLocation = document.getElementById('location')?.value.trim() || '';
      const userDesc = document.getElementById('description')?.value.trim() || '';

      const latVal = parseFloat(document.getElementById('latitude')?.value) || defaultCoords[0];
      const lngVal = parseFloat(document.getElementById('longitude')?.value) || defaultCoords[1];

      const reportData = {
        title: userTitle !== "" ? userTitle : `URGENT INCIDENT: ${selectedCategory.toUpperCase()}`,
        category: selectedCategory,
        location: userLocation !== "" ? userLocation : `Pinned Coords: (${latVal.toFixed(4)}, ${lngVal.toFixed(4)})`,
        latitude: latVal,
        longitude: lngVal,
        description: userDesc !== "" ? userDesc : `Urgent response requested for ${selectedCategory} at pinned location.`,
        image: activeImageData
      };

      submitToBackend(reportData);
    });
  }

  async function submitToBackend(data) {
    if (!navigator.onLine) {
      triggerSMSFallback(data);
      return;
    }

    try {
      const response = await fetch('/api/reports', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(data)
      });

      if (response.status === 401) {
        handleUnauthorized();
        return;
      }

      const resData = await response.json();
      if (response.ok) {
        reportForm.reset();
        activeImageData = '';
        if (fileInput) fileInput.value = '';
        if (imagePreviewContainer) imagePreviewContainer.classList.add('hidden');
        showToast(`✅ ${resData.message}`);
        fetchReports();
      } else {
        showToast(`❌ ${resData.error}`);
      }
    } catch (err) {
      triggerSMSFallback(data);
    }
  }

  function triggerSMSFallback(data) {
    const dispatchSMSNumber = "112"; 
    const smsBody = `SENTINEL ALERT:\nCat: ${data.category}\nTitle: ${data.title}\nLoc: ${data.location}\nGPS: ${data.latitude},${data.longitude}\nDetails: ${data.description}`;
    window.location.href = `sms:${dispatchSMSNumber}?body=${encodeURIComponent(smsBody)}`;
  }

  async function fetchReports() {
    try {
      const res = await fetch('/api/reports');
      if (res.ok) {
        reports = await res.json();
        renderReports();
      }
    } catch (err) {
      console.error("Fetch reports network error:", err);
    }
  }

  window.upvoteReport = async (id) => {
    try {
      const res = await fetch(`/api/reports/${id}/upvote`, {
        method: 'PATCH',
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (res.status === 401) {
        handleUnauthorized();
        return;
      }

      if (res.ok) {
        showToast('👍 Priority vote logged!');
        fetchReports();
      }
    } catch (err) {
      console.error("Upvote network error:", err);
    }
  };

  window.updateStatus = async (id, newStatus) => {
    if (!currentUser || currentUser.role !== 'authority') {
      showToast('🔒 RESTRICTED: Only verified authorities can update status.');
      return;
    }

    try {
      const res = await fetch(`/api/reports/${id}/status`, {
        method: 'PATCH',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ status: newStatus })
      });

      if (res.status === 401) {
        handleUnauthorized();
        return;
      }

      if (res.ok) {
        showToast(`📌 Status updated to "${newStatus}"`);
        fetchReports();
      } else {
        const err = await res.json();
        showToast(`❌ ${err.error}`);
      }
    } catch (err) {
      console.error("Status update error:", err);
    }
  };

  function renderReports() {
    if (!reportsList) return;

    const isAuthority = currentUser && currentUser.role === 'authority';
    const selectedCategory = filterCategory ? filterCategory.value : 'ALL';
    const searchQuery = searchInput ? searchInput.value.toLowerCase().trim() : '';

    if (map) {
      reportMarkers.forEach(m => map.removeLayer(m));
      reportMarkers = [];
    }

    const filtered = reports.filter(r => {
      const matchesCategory = selectedCategory === 'ALL' || r.category === selectedCategory;
      const matchesSearch = (r.title && r.title.toLowerCase().includes(searchQuery)) || 
                            (r.location && r.location.toLowerCase().includes(searchQuery)) ||
                            (r.description && r.description.toLowerCase().includes(searchQuery));
      return matchesCategory && matchesSearch;
    });

    filtered.forEach(report => {
      if (map && report.latitude && report.longitude) {
        const marker = L.marker([report.latitude, report.longitude])
          .addTo(map)
          .bindPopup(`
            <strong>${escapeHTML(report.title)}</strong><br>
            <small>📍 ${escapeHTML(report.location)}</small><br>
            Status: <b>${report.status}</b>
          `);
        reportMarkers.push(marker);
      }
    });

    if (filtered.length === 0) {
      reportsList.innerHTML = `<p style="color:#64748b; text-align:center;">No reports found matching your criteria.</p>`;
      return;
    }

    reportsList.innerHTML = filtered.map(report => {
      const isPending = report.status === 'Pending';
      const isInProgress = report.status === 'In Progress';
      const isResolved = report.status === 'Resolved';
      const isSecurityCategory = report.category && (report.category.includes('Kidnapping') || report.category.includes('Robbery'));

      return `
        <div class="report-card">
          <div class="report-header">
            <div>
              <h3 style="margin:0; color:#0f172a; font-size: 1.05rem;">${escapeHTML(report.title)}</h3>
              <small style="color:#64748b;">📍 ${escapeHTML(report.location)} • Filed by: ${escapeHTML(report.reportedBy)}</small>
            </div>
            <span class="badge-category ${isSecurityCategory ? 'badge-security' : ''}">
              ${escapeHTML(report.category)}
            </span>
          </div>

          <p style="margin:0.8rem 0; color:#334155; font-size: 0.9rem;">${escapeHTML(report.description)}</p>

          ${report.image ? `<img src="${report.image}" class="report-img" alt="Evidence">` : ''}

          <div style="margin-top:0.4rem; font-size:0.8rem; color:#64748b;">
            <span>Routed to: <strong>${escapeHTML(report.assignedAgencyEmail)}</strong></span>
            ${report.statusUpdatedBy ? `<span style="margin-left:0.5rem; color:#2563eb;">Updated by: ${escapeHTML(report.statusUpdatedBy)}</span>` : ''}
          </div>

          <div class="report-footer">
            <button class="upvote-btn" onclick="upvoteReport('${report._id}')">
              👍 <strong>${report.upvotes}</strong> Priority Votes
            </button>

            <div class="status-control-group">
              <button 
                class="btn-status ${isPending ? 'active-pending' : ''}" 
                onclick="updateStatus('${report._id}', 'Pending')"
                ${!isAuthority ? 'disabled title="Only Authorities can update status"' : ''}>
                Pending
              </button>
              <button 
                class="btn-status ${isInProgress ? 'active-progress' : ''}" 
                onclick="updateStatus('${report._id}', 'In Progress')"
                ${!isAuthority ? 'disabled title="Only Authorities can update status"' : ''}>
                In Progress
              </button>
              <button 
                class="btn-status ${isResolved ? 'active-resolved' : ''}" 
                onclick="updateStatus('${report._id}', 'Resolved')"
                ${!isAuthority ? 'disabled title="Only Authorities can update status"' : ''}>
                Resolved
              </button>
            </div>
          </div>
        </div>
      `;
    }).join('');
  }

  if (filterCategory) filterCategory.addEventListener('change', renderReports);
  if (searchInput) searchInput.addEventListener('input', renderReports);

  function showToast(message) {
    const toast = document.getElementById('toast');
    if (!toast) {
      alert(message);
      return;
    }
    toast.textContent = message;
    toast.className = 'show';
    setTimeout(() => { toast.className = toast.className.replace('show', ''); }, 3500);
  }

  function escapeHTML(str) {
    if (!str) return '';
    return str.toString().replace(/[&<>'"]/g, 
      tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)
    );
  }
});