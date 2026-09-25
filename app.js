// Variable per emmagatzemar l'esdeveniment natiu d'instal·lació
let deferredPrompt;
window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
});

document.addEventListener("DOMContentLoaded", () => {
    let actes = actesData;
    let favorites = JSON.parse(localStorage.getItem('fmapp_favs') || '[]');
    let userLatLng = null;
    let activeTab = 'map';
    let filterFavoritesOnly = false;
    let featureFilters = { acc: false, noFuego: false, noRuido: false, noAglom: false, familia: false, infantil: false };

    const puntsLilas = [
        { id: 'l1', titol: "Punt Lila Parc Baix Llobregat", lloc: "Parc del Baix Llobregat", lat: 41.406296466620596, lng: 2.018085377798271, horaris: [{ dia: "2026-09-25", diaStr: "Dv 25/09", inici: "22:00", fi: "04:00" }, { dia: "2026-09-26", diaStr: "Ds 26/09", inici: "22:00", fi: "04:00" }, { dia: "2026-09-28", diaStr: "Dl 28/09", inici: "22:00", fi: "05:00" }], serveis: ["Assessorament", "Acompanyament", "Informació"] },
        { id: 'l2', titol: "Punt Lila Itinerant", lloc: "Recorregut del Correfoc i Matines", lat: 41.413735699904365, lng: 2.0161305796600555, horaris: [{ dia: "2026-09-25", diaStr: "Dv 25/09", inici: "21:00", fi: "23:30" }, { dia: "2026-09-26", diaStr: "Ds 26/09", inici: "20:30", fi: "23:30" }, { dia: "2026-09-29", diaStr: "Dt 29/09", inici: "06:00", fi: "08:00" }], serveis: ["Atenció Itinerant directa", "Acompanyament coordinat"] }
    ];
    const guardiaUrbana = { titol: "Guàrdia Urbana", lloc: "Carrer Josep Maria Llopis, 1", lat: 41.41177157926289, lng: 2.0160465752029455 };

    const map = L.map('map', { zoomControl: false }).setView([41.4136, 2.0163], 15);
    L.tileLayer('https://basemaps.cartocdn.com/rastertiles/light_all/{z}/{x}/{y}.png?key=cb1_2y94_1_3099e19ace5b1c182798b317', { maxZoom: 19 }).addTo(map);
    const mapGroup = L.layerGroup().addTo(map);
    const lilaGroup = L.layerGroup().addTo(map);

    let userMarker = null;

    map.locate({ setView: false, watch: true, enableHighAccuracy: true });
    map.on('locationfound', function(e) {
        userLatLng = e.latlng;
        document.getElementById('geo-pill').classList.add('active');
        document.getElementById('geo-text').innerText = "A prop teu";
        
        if (!userMarker) {
            userMarker = L.marker(userLatLng, { icon: L.divIcon({ className: '', html: `<div style="background-color:#0ea5e9; width:20px; height:20px; border-radius:50%; border:3px solid white; box-shadow:0 0 10px rgba(0,0,0,0.3);"></div>`, iconSize: [20, 20] }) }).addTo(map);
        } else {
            userMarker.setLatLng(userLatLng);
        }
        renderMap();
        renderAgenda(document.getElementById('day-select').value);
    });

    function getDistanceMeters(lat, lng) {
        if (!userLatLng) return Infinity;
        return map.distance(userLatLng, [lat, lng]);
    }

    function getDistanceTag(lat, lng) {
        const dist = getDistanceMeters(lat, lng);
        if (dist === Infinity) return '';
        return dist < 1000 
            ? `<span class="distance-pill"><i class="fa-solid fa-person-walking"></i> ${Math.round(dist)}m</span>` 
            : `<span class="distance-pill"><i class="fa-solid fa-person-walking"></i> ${(dist/1000).toFixed(1)}km</span>`;
    }

    function parseDateTime(isoStr, timeStr) {
        return new Date(`${isoStr}T${timeStr}:00`);
    }

    function isEventFinished(acte) {
        const now = new Date();
        const start = parseDateTime(acte.dataIso, acte.horaInici);
        if (!acte.horaFi) {
            const hoursSinceStart = (now - start) / (1000 * 60 * 60);
            return hoursSinceStart >= 3;
        }
        const end = parseDateTime(acte.dataIso, acte.horaFi);
        if (end < start) end.setDate(end.getDate() + 1);
        return now > end;
    }

    function getEventStatus(acte) {
        const now = new Date();
        const start = parseDateTime(acte.dataIso, acte.horaInici);
        
        if (!acte.horaFi) {
            const diffMinsToStart = (start - now) / 60000;
            const hoursSinceStart = (now - start) / (1000 * 60 * 60);
            if (hoursSinceStart >= 0 && hoursSinceStart < 1) return 'now';
            if (diffMinsToStart > 0 && diffMinsToStart <= 30) return 'soon';
            return 'other';
        }

        const end = parseDateTime(acte.dataIso, acte.horaFi);
        if (end < start) end.setDate(end.getDate() + 1);

        if (now >= start && now <= end) return 'now';
        const diffMins = (start - now) / 60000;
        if (diffMins > 0 && diffMins <= 30) return 'soon';
        return 'other';
    }

    function getUpcomingEvents(actesList) {
        const now = new Date();
        return actesList.filter(a => parseDateTime(a.dataIso, a.horaInici) > now)
                        .sort((a, b) => parseDateTime(a.dataIso, a.horaInici) - parseDateTime(b.dataIso, b.horaInici));
    }

    function getFilteredActes(filtreDia) {
        let filtrats = [...actes];
        if (filterFavoritesOnly) filtrats = filtrats.filter(a => favorites.includes(a.id));
        if (filtreDia === 'now') filtrats = filtrats.filter(a => ['now', 'soon'].includes(getEventStatus(a)));
        else if (filtreDia !== 'all') filtrats = filtrats.filter(a => a.diaKey === filtreDia);
        
        if (featureFilters.acc) filtrats = filtrats.filter(a => a.acc === true);
        if (featureFilters.noFuego) filtrats = filtrats.filter(a => a.fuego === false);
        if (featureFilters.noRuido) filtrats = filtrats.filter(a => a.ruido === false);
        if (featureFilters.noAglom) filtrats = filtrats.filter(a => a.aglom === false);
        if (featureFilters.familia) filtrats = filtrats.filter(a => a.familia === true);
        if (featureFilters.infantil) filtrats = filtrats.filter(a => a.infantil === true);
        return filtrats;
    }

    window.toggleFavInline = function(event, id) {
        event.stopPropagation();
        const isFav = favorites.includes(id);
        if (isFav) {
            favorites = favorites.filter(favId => favId !== id);
        } else {
            favorites.push(id);
        }
        localStorage.setItem('fmapp_favs', JSON.stringify(favorites));
        document.getElementById('fav-count').innerText = favorites.length;
        renderMap(); 
        renderAgenda(document.getElementById('day-select').value);
        if (document.getElementById('org-modal').classList.contains('open')) {
            const orgEl = document.getElementById('org-name');
            if(orgEl) openOrgProfile(orgEl.dataset.currentOrg);
        }
    };

    function renderCardHTML(acte, isLinked = false) {
        const status = getEventStatus(acte);
        const isFinished = isEventFinished(acte);
        const distTag = getDistanceTag(acte.lat, acte.lng);
        const isFav = favorites.includes(acte.id);
        const imgBlock = acte.img 
            ? `<img src="${acte.img}" class="event-card-img">`
            : `<div class="event-card-img" style="background: linear-gradient(135deg, ${acte.color}, #334155); display:flex; align-items:center; justify-content:center;"><i class="fa-solid ${acte.icona} event-card-img-fallback"></i></div>`;

        let statusBadge = '';
        if (status === 'now') statusBadge = '<span class="badge badge-now"><i class="fa-solid fa-bolt"></i> Ara</span>';
        else if (status === 'soon') statusBadge = '<span class="badge badge-soon"><i class="fa-solid fa-stopwatch"></i> Aviat</span>';
        else if (isFinished) statusBadge = '<span class="badge" style="background-color: #64748b; color: #ffffff;"><i class="fa-solid fa-flag-checkered"></i> Finalitzat</span>';

        const linkedBadge = isLinked 
            ? `<span class="badge badge-linked">${acte.org}</span>` 
            : '';

        let noEndWarning = '';
        if (!acte.horaFi) {
            const now = new Date();
            const start = parseDateTime(acte.dataIso, acte.horaInici);
            const hoursSinceStart = (now - start) / (1000 * 60 * 60);
            if (hoursSinceStart >= 1 && hoursSinceStart < 3) {
                noEndWarning = '<div style="font-size:12px; color:#d97706; margin-top:6px; font-weight:bold;"><i class="fa-solid fa-triangle-exclamation"></i> Aquest acte podria haver acabat ja que no hi ha hora exacta de finalització.</div>';
            }
        }

        const cardStyle = isFinished ? 'style="opacity: 0.6; filter: grayscale(30%);"' : '';

        return `
            <div class="event-card" ${cardStyle} onclick="openModalById(${acte.id})">
                <div class="event-card-img-wrapper">${imgBlock}</div>
                <div class="event-card-info">
                    <h4>${acte.titol}</h4>
                    <div class="meta-row">
                        <span class="time-place-text"><i class="fa-solid fa-clock"></i> ${acte.horaInici}h</span>
                        ${distTag}
                    </div>
                    <div class="badge-row">
                        ${statusBadge}
                        ${linkedBadge}
                        ${acte.fuego ? '<span class="badge badge-fire"><i class="fa-solid fa-fire"></i> Pirotècnia</span>' : ''}
                        ${acte.ruido ? '<span class="badge badge-noise"><i class="fa-solid fa-volume-high"></i> Soroll Elevat</span>' : ''}
                        ${acte.acc ? '<span class="badge badge-acc"><i class="fa-solid fa-wheelchair"></i> PMR</span>' : ''}
                        ${acte.familia ? '<span class="badge badge-familia"><i class="fa-solid fa-people-roof"></i> Familiar</span>' : ''}
                        ${acte.infantil ? '<span class="badge badge-infantil"><i class="fa-solid fa-child-reaching"></i> Infantil</span>' : ''}
                    </div>
                    ${noEndWarning}
                </div>
                <button class="fav-btn-inline ${isFav ? 'active' : ''}" onclick="toggleFavInline(event, ${acte.id})">
                    <i class="fa-solid fa-heart"></i>
                </button>
            </div>
        `;
    }

    window.renderMap = function() {
        mapGroup.clearLayers(); lilaGroup.clearLayers();
        const listEl = document.getElementById('map-event-list');
        listEl.innerHTML = '';

        const filtreDia = document.getElementById('day-select').value;
        let displayEvents = [];
        let filtrats = getFilteredActes(filtreDia);

        if (filtreDia === 'now') {
            document.getElementById('sheet-status-title').innerHTML = '<i class="fa-solid fa-bolt"></i> Està passant ara';
            if (filtrats.length > 0) {
                // MODIFICACIÓ: Si hi ha actes passant o que comencen aviat, els mostrem TOTS sense límit.
                displayEvents = filtrats.sort((a, b) => getDistanceMeters(a.lat, a.lng) - getDistanceMeters(b.lat, b.lng));
            } else {
                // MODIFICACIÓ: Si NO hi ha cap acte, mostrem només els 4 pròxims.
                let prx = getUpcomingEvents(getFilteredActes('all'));
                displayEvents = prx.slice(0, 4);
                if (displayEvents.length > 0) {
                    listEl.innerHTML = `<div style="padding: 12px; background: #e0f2fe; color: #0284c7; border-radius: 12px; font-size: 13px; font-weight: 700; margin-bottom: 16px;"><i class="fa-solid fa-circle-info"></i> No hi ha cap acte actiu ni previst immediatament. Et recomanem els propers.</div>`;
                }
            }
        } else {
            document.getElementById('sheet-status-title').innerHTML = '<i class="fa-solid fa-map-location-dot"></i> Plànol d\'Actes';
            displayEvents = filtrats;
        }

        if (displayEvents.length === 0 && filtreDia !== 'now') {
            listEl.innerHTML = `<p style="text-align:center; padding:30px 20px; color:var(--text-sub); font-size:14px;">No hi ha actes amb aquests filtres.</p>`;
        }

        const grouped = {};
        displayEvents.forEach(e => {
            const k = `${e.lat},${e.lng}`;
            if(!grouped[k]) grouped[k] = [];
            grouped[k].push(e);
        });

        Object.values(grouped).forEach(group => {
            const anyLive = group.some(a => ['now', 'soon'].includes(getEventStatus(a)));
            const allFinished = group.every(a => isEventFinished(a));
            const pulseHtml = anyLive ? `<div class="live-pulse"></div>` : '';
            const opacityStyle = allFinished ? 'opacity: 0.55; filter: grayscale(70%);' : '';

            if (group.length === 1) {
                const acte = group[0];
                const isFin = isEventFinished(acte);
                const m = L.marker([acte.lat, acte.lng], { 
                    icon: L.divIcon({ html: `<div class="marker-pin" style="--color:${isFin ? '#64748b' : acte.color}; ${isFin ? 'opacity:0.6; filter:grayscale(60%);' : ''}">${pulseHtml}<i class="fa-solid ${acte.icona}"></i></div>`, className: '', iconSize: [36,36], iconAnchor: [18,18] }) 
                }).addTo(mapGroup);
                m.on('click', () => openModalById(acte.id));
                listEl.innerHTML += renderCardHTML(acte);
            } else {
                const m = L.marker([group[0].lat, group[0].lng], { 
                    icon: L.divIcon({ html: `<div class="marker-pin" style="--color:${allFinished ? '#64748b' : '#0f172a'}; ${opacityStyle}">${pulseHtml}<span style="font-weight:800; font-size:14px;">${group.length}</span></div>`, className: '', iconSize: [36,36], iconAnchor: [18,18] }) 
                }).addTo(mapGroup);
                m.on('click', () => openMultiModal(group));
                group.forEach(acte => { listEl.innerHTML += renderCardHTML(acte); });
            }
        });

        puntsLilas.forEach(punt => {
            const marker = L.marker([punt.lat, punt.lng], { icon: L.divIcon({ html: `<div class="marker-pin" style="--color:#8b5cf6"><i class="fa-solid fa-hand"></i></div>`, className: '', iconSize: [36, 36], iconAnchor: [18, 18] }) }).addTo(lilaGroup);
            marker.on('click', () => openLilaModal(punt));
        });
        const policeMarker = L.marker([guardiaUrbana.lat, guardiaUrbana.lng], { icon: L.divIcon({ html: `<div class="marker-pin" style="--color:#2563eb"><i class="fa-solid fa-shield-halved"></i></div>`, className: '', iconSize: [36, 36], iconAnchor: [18, 18] }) }).addTo(mapGroup);
        policeMarker.on('click', () => openPoliceModal());
    };

    window.renderAgenda = function(filtreDia) {
        const agendaEl = document.getElementById('agenda-timeline');
        agendaEl.innerHTML = '';
        let filtrats = getFilteredActes(filtreDia);
        
        if (filtrats.length === 0) {
            agendaEl.innerHTML = `<p style="text-align:center; padding:30px 20px; color:var(--text-sub); font-size:14px;">No hi ha actes amb aquests filtres.</p>`;
            return;
        }

        const groupedByDay = {};
        filtrats.forEach(acte => {
            const dayKey = acte.dataIso || acte.diaNom;
            if (!groupedByDay[dayKey]) {
                groupedByDay[dayKey] = {
                    diaNom: acte.diaNom,
                    actes: []
                };
            }
            groupedByDay[dayKey].actes.push(acte);
        });

        const sortedDayKeys = Object.keys(groupedByDay).sort();

        sortedDayKeys.forEach(dayKey => {
            const group = groupedByDay[dayKey];
            if (group.actes.length > 0) {
                const dayGroupEl = document.createElement('div');
                dayGroupEl.className = 'agenda-day-group';
                dayGroupEl.innerHTML = `
                    <div class="agenda-day-header">
                        <i class="fa-solid fa-calendar-day"></i>
                        <span>${group.diaNom}</span>
                    </div>
                `;

                group.actes.sort((a, b) => parseDateTime(a.dataIso, a.horaInici) - parseDateTime(b.dataIso, b.horaInici));

                group.actes.forEach(acte => {
                    dayGroupEl.innerHTML += renderCardHTML(acte);
                });

                agendaEl.appendChild(dayGroupEl);
            }
        });
    };

    window.toggleFeatureFilter = function(key) {
        featureFilters[key] = !featureFilters[key];
        document.getElementById(`chip-${key}`).classList.toggle('active', featureFilters[key]);
        renderMap(); renderAgenda(document.getElementById('day-select').value);
    };

    window.onDayChange = function() {
        renderMap(); renderAgenda(document.getElementById('day-select').value);
    };

    window.toggleFavoritesFilter = function() {
        filterFavoritesOnly = !filterFavoritesOnly;
        document.getElementById('fav-filter-btn').classList.toggle('active', filterFavoritesOnly);
        renderMap(); renderAgenda(document.getElementById('day-select').value);
    };

    window.switchTab = function(tab) {
        activeTab = tab;
        document.querySelectorAll('.app-view, .nav-item').forEach(e => e.classList.remove('active'));
        document.getElementById(`view-${tab}`).classList.add('active');
        document.getElementById(`nav-${tab}`).classList.add('active');
        if (tab === 'map') setTimeout(() => map.invalidateSize(), 200);
    };

    window.toggleSheet = function() { document.getElementById('bottom-sheet').classList.toggle('expanded'); };

    let defaultModalHtml = document.getElementById('modal-dynamic-content').innerHTML;

    window.openMultiModal = function(group) {
        group.sort((a, b) => parseDateTime(a.dataIso, a.horaInici) - parseDateTime(b.dataIso, b.horaInici));

        const groupedByDay = {};
        group.forEach(a => {
            const dayKey = a.dataIso || a.diaNom;
            if (!groupedByDay[dayKey]) {
                groupedByDay[dayKey] = {
                    diaNom: a.diaNom,
                    actes: []
                };
            }
            groupedByDay[dayKey].actes.push(a);
        });

        let html = `<div class="modal-body"><h2>📍 ${group[0].lloc}</h2><p style="color:var(--text-sub); font-size:14px; margin-bottom:10px;">Hi ha ${group.length} actes en aquest punt:</p><div class="multi-event-list">`;

        Object.keys(groupedByDay).sort().forEach(dayKey => {
            const dayGroup = groupedByDay[dayKey];
            html += `<div style="font-weight:700; font-size:13px; color:#475569; margin: 14px 0 8px 0; padding-bottom: 4px; border-bottom: 1px solid #e2e8f0; display:flex; align-items:center; gap:6px;">
                <i class="fa-solid fa-calendar-day" style="color:var(--primary);"></i> ${dayGroup.diaNom}
            </div>`;
            
            dayGroup.actes.forEach(a => {
                const status = getEventStatus(a);
                const isFinished = isEventFinished(a);
                let statusBadge = '';
                
                if (status === 'now') {
                    statusBadge = '<span class="badge badge-now" style="font-size: 10px; padding: 2px 6px;"><i class="fa-solid fa-bolt"></i> Ara</span>';
                } else if (status === 'soon') {
                    statusBadge = '<span class="badge badge-soon" style="font-size: 10px; padding: 2px 6px;"><i class="fa-solid fa-stopwatch"></i> Aviat</span>';
                } else if (isFinished) {
                    statusBadge = '<span class="badge" style="background-color: #64748b; color: #ffffff; font-size: 10px; padding: 2px 6px;"><i class="fa-solid fa-flag-checkered"></i> Finalitzat</span>';
                }
                
                const itemStyle = isFinished ? 'style="opacity: 0.6; filter: grayscale(30%);"' : '';

                html += `<div class="multi-event-item" ${itemStyle} onclick="openModalById(${a.id})">
                    <div class="multi-event-icon" style="background:${a.color}"><i class="fa-solid ${a.icona}"></i></div>
                    <div>
                        <h4 style="font-size:14px; font-weight:800; margin:0;">${a.titol}</h4>
                        <div style="display: flex; align-items: center; gap: 6px; margin-top: 2px;">
                            <span style="font-size:12px; color:#64748b;"><i class="fa-solid fa-clock"></i> ${a.horaInici}h</span>
                            ${statusBadge}
                        </div>
                    </div>
                </div>`;
            });
        });

        html += `</div></div>`;
        document.getElementById('modal-dynamic-content').innerHTML = html;
        document.getElementById('event-modal').classList.add('open');
    };

    window.openModalById = function(id) { 
        const a = actes.find(x => x.id === id); 
        if (a) {
            document.getElementById('org-modal').classList.remove('open');
            openModal(a);
        }
    };

    window.openModal = function(acte) {
        document.getElementById('modal-dynamic-content').innerHTML = defaultModalHtml;
        
        const imgEl = document.getElementById('modal-img');
        const fallbackEl = document.getElementById('modal-img-fallback');
        if(acte.img) {
            imgEl.src = acte.img;
            imgEl.style.display = 'block';
            fallbackEl.style.display = 'none';
        } else {
            imgEl.style.display = 'none';
            fallbackEl.style.display = 'flex';
            fallbackEl.style.background = `linear-gradient(135deg, ${acte.color}, #334155)`;
            fallbackEl.innerHTML = `<i class="fa-solid ${acte.icona}"></i>`;
        }

        document.getElementById('modal-cat').innerText = acte.categoria;
        document.getElementById('modal-title').innerText = acte.titol;
        
        const orgEl = document.getElementById('modal-org');
        orgEl.innerText = acte.org;
        orgEl.dataset.org = acte.org;

        document.getElementById('modal-date').innerText = acte.horaFi ? `${acte.diaNom} (${acte.horaInici} - ${acte.horaFi}h)` : `${acte.diaNom} (${acte.horaInici}h)`;
        document.getElementById('modal-place').innerText = acte.lloc;
        
        const dist = getDistanceMeters(acte.lat, acte.lng);
        document.getElementById('modal-distance').innerHTML = dist !== Infinity ? (dist < 1000 ? `${Math.round(dist)}m` : `${(dist/1000).toFixed(1)}km`) : '';
        document.getElementById('modal-desc').innerText = acte.desc;

        if (!acte.horaFi) {
            const now = new Date();
            const start = parseDateTime(acte.dataIso, acte.horaInici);
            const hoursSinceStart = (now - start) / (1000 * 60 * 60);
            if (hoursSinceStart >= 1 && hoursSinceStart < 3) {
                document.getElementById('modal-desc').innerHTML += '<div style="font-size:13px; color:#d97706; margin-top:8px; padding: 8px; background: #fef3c7; border-radius: 6px;"><i class="fa-solid fa-triangle-exclamation"></i> Aquest acte podria haver acabat ja que no hi ha hora exacta de finalització.</div>';
            }
        }

        let badges = '';
        const status = getEventStatus(acte);
        const isFinished = isEventFinished(acte);
        if (status === 'now') badges += `<span class="badge badge-now"><i class="fa-solid fa-bolt"></i> Passant Ara</span> `;
        else if (status === 'soon') badges += `<span class="badge badge-soon"><i class="fa-solid fa-stopwatch"></i> Comença Aviat</span> `;
        else if (isFinished) badges += `<span class="badge" style="background-color: #64748b; color: #ffffff;"><i class="fa-solid fa-flag-checkered"></i> Acte Finalitzat</span> `;

        if (acte.fuego) badges += `<span class="badge badge-fire"><i class="fa-solid fa-fire"></i> Pirotècnia</span> `;
        if (acte.ruido) badges += `<span class="badge badge-noise"><i class="fa-solid fa-volume-high"></i> Soroll Elevat</span> `;
        if (acte.aglom) badges += `<span class="badge badge-aglom"><i class="fa-solid fa-users"></i> Aglomeracions</span> `;
        if (acte.acc) badges += `<span class="badge badge-acc"><i class="fa-solid fa-wheelchair"></i> PMR</span> `;
        if (acte.familia) badges += `<span class="badge badge-familia"><i class="fa-solid fa-people-roof"></i> Familiar</span> `;
        if (acte.infantil) badges += `<span class="badge badge-infantil"><i class="fa-solid fa-child-reaching"></i> Infantil</span> `;
        document.getElementById('modal-badges').innerHTML = badges;

        // Disclaimers de Seguretat i Recomanacions
        let disclaimersHtml = '';
        if (acte.fuego) {
            disclaimersHtml += `
                <div class="disclaimer-chip fire-disclaimer" onclick="openFocModal()">
                    <i class="fa-solid fa-circle-exclamation"></i> <span>Pirotècnia: <u>Consulta les normes de seguretat</u></span>
                </div>
            `;
        }
        if (acte.ruido || acte.aglom) {
            const msg = (acte.ruido && acte.aglom) ? 'Soroll i Aglomeracions' : (acte.ruido ? 'Soroll Elevat' : 'Aglomeracions');
            disclaimersHtml += `
                <div class="disclaimer-chip info-disclaimer" onclick="openRecomanacionsModal()">
                    <i class="fa-solid fa-circle-info"></i> <span>${msg}: <u>Veure recomanacions</u></span>
                </div>
            `;
        }
        const disclaimersEl = document.getElementById('modal-disclaimers');
        if (disclaimersEl) {
            disclaimersEl.innerHTML = disclaimersHtml;
            disclaimersEl.style.display = disclaimersHtml ? 'flex' : 'none';
        }

        // Botons Ticket / RSVP / Entrades
        const ticketBtn = document.getElementById('modal-ticket-btn');
        const rsvpBtn = document.getElementById('modal-rsvp-btn');
        const hoursBtn = document.getElementById('modal-hours-btn');

        
        const ticketUrl = acte.ticket || acte.entrades;
        if (ticketUrl && ticketUrl.trim() !== "") {
            ticketBtn.href = ticketUrl;
            ticketBtn.style.display = 'flex';
        } else {
            ticketBtn.style.display = 'none';
        }

        if (acte.rsvp && acte.rsvp.trim() !== "") {
            rsvpBtn.href = acte.rsvp;
            rsvpBtn.style.display = 'flex';
        } else {
            rsvpBtn.style.display = 'none';
        }

         if (acte.hours && acte.hours.trim() !== "") {
            hoursBtn.href = acte.hours;
            hoursBtn.style.display = 'flex';
        } else {
            hoursBtn.style.display = 'none';
        }

        const favBtn = document.getElementById('modal-fav-btn');
        const isFav = favorites.includes(acte.id);
        favBtn.innerHTML = isFav ? `<i class="fa-solid fa-heart-crack"></i> Treure Preferit` : `<i class="fa-solid fa-heart"></i> Afegir Preferit`;
        favBtn.onclick = () => {
            isFav ? favorites = favorites.filter(id => id !== acte.id) : favorites.push(acte.id);
            localStorage.setItem('fmapp_favs', JSON.stringify(favorites));
            document.getElementById('fav-count').innerText = favorites.length;
            openModal(acte); renderMap(); renderAgenda(document.getElementById('day-select').value);
        };

        document.getElementById('modal-nav-btn').onclick = () => {
            closeModal('event-modal'); switchTab('map');
            map.flyTo([acte.lat, acte.lng], 18, { duration: 1.2 });
        };
        document.getElementById('event-modal').classList.add('open');
    };

    window.openOrgProfile = function(orgName) {
        closeModal('event-modal');
        const orgData = organizersData[orgName] || { 
            img: "", 
            verified: false, 
            badgeType: "",
            verifiedDesc: "",
            desc: "Entitat organitzadora",
            linkedOrgs: []
        };

        const orgTitleEl = document.getElementById('org-name');
        orgTitleEl.dataset.currentOrg = orgName;

        let badgeHtml = '';
        if (orgName === "Ajuntament de Molins de Rei" || orgData.verified) {
            const tooltipText = orgData.verifiedDesc || "Perfil oficial verificat de l'Ajuntament de Molins de Rei";
            badgeHtml = `<span class="verified-icon-inline" title="${tooltipText}" onclick="alert('${tooltipText}')"><i class="fa-solid fa-circle-check" style="color: #3b82f6;"></i></span>`;
        }
        
        orgTitleEl.innerHTML = `${orgName} ${badgeHtml}`;
        document.getElementById('org-desc').innerText = orgData.desc || "Entitat organitzadora";

        const igBtn = document.getElementById('org-ig');
        if (orgData.ig) {
            igBtn.href = orgData.ig;
            igBtn.style.display = 'inline-flex';
        } else {
            igBtn.style.display = 'none';
        }
        
        const avatarEl = document.getElementById('org-avatar');
        if (orgData.img) {
            avatarEl.innerHTML = `<img src="${orgData.img}" alt="${orgName}">`;
        } else {
            avatarEl.innerHTML = `<i class="fa-solid fa-building-user"></i>`;
        }

        const linkedList = orgData.linkedOrgs || [];
        const allRelatedEvents = actes.filter(a => a.org === orgName || linkedList.includes(a.org))
                                     .sort((a, b) => parseDateTime(a.dataIso, a.horaInici) - parseDateTime(b.dataIso, b.horaInici));

        const listEl = document.getElementById('org-events-list');
        listEl.innerHTML = '';

        if (allRelatedEvents.length === 0) {
            listEl.innerHTML = `<p style="color:var(--text-sub); font-size:13px;">No s'han trobat actes per aquest organitzador.</p>`;
        } else {
            allRelatedEvents.forEach(acte => {
                const isLinked = (acte.org !== orgName);
                listEl.innerHTML += renderCardHTML(acte, isLinked);
            });
        }

        document.getElementById('org-modal').classList.add('open');
    };

    window.openLilaModalById = function(id) { const p = puntsLilas.find(x => x.id === id); if(p) openLilaModal(p); };
    
    window.openLilaModal = function(p) { 
        document.getElementById('lila-title').innerText = p.titol;
        document.getElementById('lila-location').innerText = p.lloc;

        let schedHtml = '';
        let isOpen = false;
        const now = new Date();

        p.horaris.forEach(h => {
            schedHtml += `<div><span>${h.diaStr}</span><span>${h.inici} - ${h.fi}h</span></div>`;
            const start = parseDateTime(h.dia, h.inici);
            const end = parseDateTime(h.dia, h.fi);
            if (end < start) end.setDate(end.getDate() + 1);
            if (now >= start && now <= end) isOpen = true;
        });
        
        document.getElementById('lila-schedule-list').innerHTML = schedHtml;

        const statusEl = document.getElementById('lila-status');
        const heroEl = document.getElementById('lila-hero-bg');
        if (isOpen) {
            statusEl.innerHTML = '● OBERT ARA';
            statusEl.className = 'lila-status-badge open';
            heroEl.style.background = 'linear-gradient(135deg, #8b5cf6, #6d28d9)';
        } else {
            statusEl.innerHTML = '● TANCAT';
            statusEl.className = 'lila-status-badge';
            heroEl.style.background = 'linear-gradient(135deg, #475569, #334155)';
        }

        document.getElementById('lila-services').innerHTML = p.serveis.map(s => `<li><i class="fa-solid fa-check" style="color:var(--purple-lila)"></i> ${s}</li>`).join('');

        document.getElementById('lila-nav-btn').onclick = () => {
            closeModal('lila-modal'); switchTab('map');
            map.flyTo([p.lat, p.lng], 18, { duration: 1.2 });
        };

        document.getElementById('lila-modal').classList.add('open'); 
    };

    window.openPoliceModal = function() { document.getElementById('police-modal').classList.add('open'); };
    
    // FUNCIONS PER OBRIR ELS NOUS MODALS DE SERVEIS
    window.openFocModal = function() { document.getElementById('foc-modal').classList.add('open'); };
    window.openRecomanacionsModal = function() { document.getElementById('recomanacions-modal').classList.add('open'); };
    window.openBusModal = function() { document.getElementById('bus-modal').classList.add('open'); };

    window.closeModal = function(id) { 
        document.getElementById(id).classList.remove('open'); 
        if(id === 'event-modal') setTimeout(() => document.getElementById('modal-dynamic-content').innerHTML = defaultModalHtml, 300);
    };

    // FUNCIONS PEL MODAL D'INSTAL·LACIÓ NOU
    window.closeInstallModal = function() {
        document.getElementById('install-modal').classList.remove('open');
    };

    // Comprovem si és la primera vegada
    const hasSeenInstallPrompt = localStorage.getItem('fmapp_install_prompt');
    if (!hasSeenInstallPrompt) {
        // Mostrem el modal uns segons després que carregui la pàgina
        setTimeout(() => {
            document.getElementById('install-modal').classList.add('open');
            localStorage.setItem('fmapp_install_prompt', 'true');
        }, 1500);
    }

    const installBtn = document.getElementById('install-app-btn');
    if (installBtn) {
        installBtn.addEventListener('click', async () => {
            if (deferredPrompt) {
                // Trucada nativa d'instal·lació (Android/Chrome)
                deferredPrompt.prompt();
                const { outcome } = await deferredPrompt.userChoice;
                deferredPrompt = null;
                closeInstallModal();
            } else {
                // Alerta explicativa per Safari/iOS o usuaris sense PWA support
                alert("Per afegir l'aplicació a la pantalla d'inici:\n\n- A iPhone (Safari): Toca la icona de compartir (quadrat amb fletxa) i selecciona 'Afegeix a la pantalla d'inici'.\n- A Android: Obre el menú del navegador i selecciona 'Afegeix a la pantalla d'inici'.");
                closeInstallModal();
            }
        });
    }

    window.centerOnUser = function() {
        if (userLatLng) map.flyTo(userLatLng, 17, {duration: 1.5});
        else alert("Buscant ubicació... Assegurat de donar permisos.");
    };

    document.getElementById('fav-count').innerText = favorites.length;
    renderMap();
    renderAgenda(document.getElementById('day-select').value);
});
