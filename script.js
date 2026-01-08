import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-app.js";
import { getDatabase, ref, push, onValue, update, remove, set, serverTimestamp } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-database.js";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, onAuthStateChanged, signOut, updateProfile } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js";
import { firebaseConfig, DEFAULT_CONFIG } from "./config.js";

// --- ALUSTUS ---
const app = initializeApp(firebaseConfig);
const database = getDatabase(app);
const auth = getAuth(app);

// ADMIN-KÄYTTÄJÄT (Lisää tähän sähköpostit, joilla on oikeus poistaa muita)
const ADMIN_EMAILS = ['toni@kauppinen.info']; 

// VÄRIPALETTI
const VARIPALETTI = [
    '#e74c3c', '#e67e22', '#f1c40f', '#2ecc71', '#1abc9c', 
    '#3498db', '#9b59b6', '#34495e', '#7f8c8d', '#ff9ff3', 
    '#f368e0', '#00d2d3', '#5f27cd', '#c8d6e5', '#576574'
];

// --- GLOBAALIT ---
let nykyinenKayttaja = null; 
let nykyinenUid = null;
let nykyinenEmail = null; // Tarvitaan admin-tarkistukseen
let perheenJasenet = {}; 
let kaikkiTapahtumat = [];
let kaikkiTehtavat = [];
let nykyinenPaiva = new Date();
let valittuVari = ''; 

// Kuuntelijat
let unsubscribeEvents = null;
let unsubscribeTasks = null;
let unsubscribeSettings = null;

let menneetSivu = 0;
let tulevatSivu = 0;
const TAPAHTUMIA_PER_SIVU = 10;

// --- DOM ELEMENTIT ---
const elements = {
    loginOverlay: document.getElementById('login-overlay'),
    loginForm: document.getElementById('login-form'),
    mainContainer: document.getElementById('main-container'),
    currentUserDisplay: document.getElementById('current-user-name'),
    logoutBtn: document.getElementById('logout-btn'),
    authToggleLink: document.getElementById('auth-toggle-link'),
    authSubmitBtn: document.getElementById('submit-auth-btn'),
    authToggleText: document.getElementById('auth-toggle-text'),
    loginError: document.getElementById('login-error'),
    
    // Kalenteri
    grid: document.getElementById('kalenteri-grid'),
    monthTitle: document.getElementById('kuukausi-otsikko'),
    prevMonth: document.getElementById('edellinen-kk'),
    nextMonth: document.getElementById('seuraava-kk'),
    todayBtn: document.getElementById('tanaan-btn'),
    dayHeaders: document.getElementById('kalenteri-paivat-otsikot'),

    // Listat & Lomakkeet
    upcomingList: document.getElementById('tulevat-tapahtumat-lista'),
    searchField: document.getElementById('haku-kentta'),
    filterContainer: document.getElementById('tulevat-suodatin'),
    addForm: document.getElementById('lisaa-tapahtuma-lomake'),
    sidebar: document.querySelector('.sivupalkki'),
    openAddFormBtn: document.getElementById('avaa-lisays-lomake-btn'),

    // Tehtävät
    taskListContainer: document.getElementById('tehtavat-container'),
    taskInput: document.getElementById('uusi-tehtava-teksti'),
    addTaskBtn: document.getElementById('lisaa-tehtava-nappi'),
    taskAssignContainer: document.getElementById('lisaa-tehtava-henkilot'),
    taskListToggle: document.getElementById('tehtavalista-toggle'),
    taskListContent: document.getElementById('tehtavalista-sisalto'),
    openArchiveBtn: document.getElementById('avaa-arkisto-btn'),

    // Modals
    eventModal: document.getElementById('tapahtuma-modal-overlay'),
    pastModal: document.getElementById('menneet-tapahtumat-modal'),
    archiveModal: document.getElementById('tehtava-arkisto-modal'),
    
    // Asetukset
    settingsModal: document.getElementById('settings-modal'),
    openSettingsBtn: document.getElementById('open-settings-btn'),
    closeSettingsBtn: document.getElementById('close-settings-btn'),
    settingsUserList: document.getElementById('settings-users-list'),
    
    // Omat profiilikentät
    omaNayttonimiInput: document.getElementById('oma-nayttonimi'),
    variValitsinContainer: document.getElementById('varivalitsin-container'),
    tallennaProfiiliBtn: document.getElementById('tallenna-profiili-btn'),
    variVirhe: document.getElementById('vari-virhe')
};

// --- AUTHENTICATION & STARTUP ---
let isRegistering = false;

document.addEventListener('DOMContentLoaded', () => {
    alustaPerusKuuntelijat();
    
    onAuthStateChanged(auth, (user) => {
        if (user) {
            nykyinenUid = user.uid;
            nykyinenEmail = user.email;
            nykyinenKayttaja = user.displayName || user.email.split('@')[0];
            elements.currentUserDisplay.textContent = nykyinenKayttaja;
            naytaSovellus(user);
        } else {
            piilotaSovellus();
        }
    });
});

function alustaPerusKuuntelijat() {
    // Auth toggle
    if(elements.authToggleLink) {
        elements.authToggleLink.addEventListener('click', (e) => {
            e.preventDefault();
            isRegistering = !isRegistering;
            elements.authSubmitBtn.textContent = isRegistering ? 'Rekisteröidy' : 'Kirjaudu sisään';
            elements.authToggleText.textContent = isRegistering ? 'Onko sinulla jo tunnus?' : 'Uusi käyttäjä?';
            elements.authToggleLink.textContent = isRegistering ? 'Kirjaudu' : 'Luo tunnus';
            elements.loginError.classList.add('hidden');
        });
    }

    elements.loginForm.addEventListener('submit', handleAuth);
    elements.logoutBtn.addEventListener('click', () => signOut(auth));

    // Kalenteri navigaatio
    elements.prevMonth.addEventListener('click', () => { nykyinenPaiva.setMonth(nykyinenPaiva.getMonth() - 1); piirraKalenteri(); });
    elements.nextMonth.addEventListener('click', () => { nykyinenPaiva.setMonth(nykyinenPaiva.getMonth() + 1); piirraKalenteri(); });
    elements.todayBtn.addEventListener('click', () => { nykyinenPaiva = new Date(); piirraKalenteri(); });

    // Lomake toggle
    elements.openAddFormBtn.addEventListener('click', () => elements.sidebar.classList.toggle('hidden'));
    elements.addForm.addEventListener('submit', lisaaTapahtuma);
    
    // ASETUKSET - Tässä oli aiemmin vikaa, nyt varmistettu
    if(elements.openSettingsBtn) {
        elements.openSettingsBtn.addEventListener('click', avaaOmatAsetukset);
    }
    if(elements.closeSettingsBtn) {
        elements.closeSettingsBtn.addEventListener('click', () => elements.settingsModal.classList.add('hidden'));
    }
    if(elements.tallennaProfiiliBtn) {
        elements.tallennaProfiiliBtn.addEventListener('click', tallennaOmaProfiili);
    }

    // Sulje modaalit taustaa klikkaamalla
    document.querySelectorAll('.modal-overlay').forEach(modal => {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.classList.add('hidden');
        });
    });

    // Listat
    elements.taskListToggle.addEventListener('click', () => elements.taskListContent.classList.toggle('hidden'));
    elements.addTaskBtn.addEventListener('click', lisaaTehtava);
    elements.searchField.addEventListener('input', () => { tulevatSivu = 0; naytaTulevatTapahtumat(); });
}

async function handleAuth(e) {
    e.preventDefault();
    const email = document.getElementById('login-email').value;
    const pass = document.getElementById('login-password').value;
    
    try {
        if (isRegistering) {
            await createUserWithEmailAndPassword(auth, email, pass);
        } else {
            await signInWithEmailAndPassword(auth, email, pass);
        }
        elements.loginForm.reset();
        elements.loginError.classList.add('hidden');
    } catch (error) {
        console.error(error);
        let msg = "Virhe kirjautumisessa.";
        if (error.code === 'auth/email-already-in-use') msg = "Sähköposti on jo käytössä.";
        if (error.code === 'auth/invalid-credential') msg = "Väärä tunnus tai salasana.";
        elements.loginError.textContent = msg;
        elements.loginError.classList.remove('hidden');
    }
}

function naytaSovellus(user) {
    elements.loginOverlay.classList.add('hidden');
    elements.mainContainer.classList.remove('hidden');
    lataaKayttajatJaVarmistaOma(user);
    lataaTapahtumat();
    lataaTehtavat();
}

function piilotaSovellus() {
    elements.mainContainer.classList.add('hidden');
    elements.loginOverlay.classList.remove('hidden');
    if (unsubscribeSettings) unsubscribeSettings();
    if (unsubscribeEvents) unsubscribeEvents();
    if (unsubscribeTasks) unsubscribeTasks();
}

// --- DATA: KÄYTTÄJÄT & OMAT TIEDOT ---
function lataaKayttajatJaVarmistaOma(user) {
    const usersRef = ref(database, 'asetukset/kayttajat');
    unsubscribeSettings = onValue(usersRef, (snapshot) => {
        const data = snapshot.val() || {};
        perheenJasenet = data;

        if (!perheenJasenet[user.uid]) {
            luoOletusProfiili(user);
        } else {
            nykyinenKayttaja = perheenJasenet[user.uid].nayttonimi;
            elements.currentUserDisplay.textContent = nykyinenKayttaja;
        }

        paivitaKayttoliittymaAsetuksilla();
    });
}

function luoOletusProfiili(user) {
    const kaytetytVarit = Object.values(perheenJasenet || {}).map(u => u.vari);
    const vapaaVari = VARIPALETTI.find(c => !kaytetytVarit.includes(c)) || '#999999';
    const oletusNimi = user.email.split('@')[0];
    const displayName = oletusNimi.charAt(0).toUpperCase() + oletusNimi.slice(1);

    const uusiProfiili = {
        nayttonimi: displayName,
        vari: vapaaVari,
        email: user.email // Tallennetaan email tunnistamista varten
    };

    update(ref(database, `asetukset/kayttajat/${user.uid}`), uusiProfiili);
}

// --- ASETUKSET IKKUNA ---
function avaaOmatAsetukset() {
    const minunTiedot = perheenJasenet[nykyinenUid];
    if (!minunTiedot) return;

    elements.omaNayttonimiInput.value = minunTiedot.nayttonimi;
    valittuVari = minunTiedot.vari;
    
    piirraVariValitsin();
    paivitaKayttajaListaAsetuksiin();
    elements.settingsModal.classList.remove('hidden');
}

function piirraVariValitsin() {
    const container = elements.variValitsinContainer;
    container.innerHTML = '';
    elements.variVirhe.classList.add('hidden');

    const varatutVarit = Object.entries(perheenJasenet)
        .filter(([uid, data]) => uid !== nykyinenUid)
        .map(([uid, data]) => data.vari);

    VARIPALETTI.forEach(vari => {
        const pallo = document.createElement('div');
        pallo.className = 'color-option';
        pallo.style.backgroundColor = vari;
        
        if (vari === valittuVari) {
            pallo.classList.add('selected');
        }

        if (varatutVarit.includes(vari)) {
            pallo.classList.add('taken');
        } else {
            pallo.addEventListener('click', () => {
                valittuVari = vari;
                piirraVariValitsin();
            });
        }
        container.appendChild(pallo);
    });
}

function paivitaKayttajaListaAsetuksiin() {
    const list = elements.settingsUserList;
    list.innerHTML = '';
    
    const isAdmin = ADMIN_EMAILS.includes(nykyinenEmail);

    Object.entries(perheenJasenet).forEach(([uid, user]) => {
        // Ei näytetä itseä listassa, koska itseä muokataan ylhäällä
        if (uid === nykyinenUid) return;

        const div = document.createElement('div');
        div.className = 'settings-user-item';
        
        let content = `
            <div class="user-info-left">
                <div class="user-color-circle" style="background-color: ${user.vari}"></div>
                <span>${user.nayttonimi}</span>
            </div>
        `;

        // Lisää poistonappi vain jos olet Admin
        if (isAdmin) {
            const delBtn = document.createElement('button');
            delBtn.className = 'delete-user-btn';
            delBtn.textContent = 'Poista';
            delBtn.onclick = () => poistaKayttaja(uid, user.nayttonimi);
            div.appendChild(delBtn);
            // Muutetaan HTML-rakennetta että append toimii oikein
            div.innerHTML = content; 
            div.appendChild(delBtn); 
        } else {
            div.innerHTML = content;
        }
        
        list.appendChild(div);
    });
}

function poistaKayttaja(uid, nimi) {
    if(confirm(`Haluatko varmasti poistaa käyttäjän ${nimi}? Hänen tapahtumansa säilyvät kannassa, mutta hän ei voi enää suodattaa näkymää omalla nimellään.`)) {
        remove(ref(database, `asetukset/kayttajat/${uid}`)).then(() => {
            alert("Käyttäjä poistettu.");
        });
    }
}

function tallennaOmaProfiili() {
    const uusiNimi = elements.omaNayttonimiInput.value.trim();
    if (!uusiNimi) return alert("Nimi ei voi olla tyhjä");

    update(ref(database, `asetukset/kayttajat/${nykyinenUid}`), {
        nayttonimi: uusiNimi,
        vari: valittuVari
    }).then(() => {
        alert("Tiedot päivitetty!");
        elements.settingsModal.classList.add('hidden');
    }).catch(err => {
        alert("Virhe tallennuksessa: " + err.message);
    });
}

// --- UI PÄIVITYKSET ---
function paivitaKayttoliittymaAsetuksilla() {
    elements.filterContainer.innerHTML = '<button class="filter-btn active" data-filter="kaikki">Kaikki</button>';
    
    const perheBtn = document.createElement('button');
    perheBtn.className = 'filter-btn';
    perheBtn.dataset.filter = 'perhe';
    perheBtn.textContent = 'Koko perhe';
    elements.filterContainer.appendChild(perheBtn);

    Object.entries(perheenJasenet).forEach(([uid, user]) => {
        const btn = document.createElement('button');
        btn.className = 'filter-btn';
        btn.dataset.filter = uid;
        btn.textContent = user.nayttonimi;
        elements.filterContainer.appendChild(btn);
    });

    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            tulevatSivu = 0;
            naytaTulevatTapahtumat();
        });
    });

    paivitaDynaamisetLomakkeet();
    piirraKalenteri();
}

function paivitaDynaamisetLomakkeet() {
    const taskContainer = elements.taskAssignContainer;
    taskContainer.innerHTML = '<small>Kohdista:</small>';
    Object.entries(perheenJasenet).forEach(([uid, user]) => {
        const btn = document.createElement('button');
        btn.className = 'assign-btn';
        btn.dataset.assignee = uid;
        btn.textContent = user.nayttonimi.charAt(0).toUpperCase();
        btn.title = user.nayttonimi;
        btn.style.borderColor = user.vari;
        btn.addEventListener('click', () => btn.classList.toggle('active'));
        taskContainer.appendChild(btn);
    });

    ['.ketakoskee-valinnat', '.nakyvyys-valinnat', '#muokkaa-ketakoskee', '#muokkaa-nakyvyys'].forEach((selector) => {
        const containers = document.querySelectorAll(selector);
        containers.forEach(container => {
            const isVisibility = selector.includes('nakyvyys');
            const nameAttr = selector.includes('muokkaa') 
                ? (isVisibility ? 'muokkaa-nakyvyys' : 'muokkaa-ketakoskee') 
                : (isVisibility ? 'nakyvyys' : 'lisaa-ketakoskee');

            container.innerHTML = '';
            
            if (!isVisibility) {
                const label = document.createElement('label');
                label.innerHTML = `<input type="checkbox" name="${nameAttr}" value="perhe"> Koko perhe`;
                container.appendChild(label);
            }

            Object.entries(perheenJasenet).forEach(([uid, user]) => {
                const label = document.createElement('label');
                const checked = isVisibility ? 'checked' : '';
                label.innerHTML = `<input type="checkbox" name="${nameAttr}" value="${uid}" ${checked}> ${user.nayttonimi}`;
                container.appendChild(label);
            });

            if(!isVisibility) {
               container.addEventListener('change', (e) => handleFamilyCheckbox(e, container));
            }
        });
    });
}

function handleFamilyCheckbox(e, container) {
    if (e.target.value === 'perhe') {
        const otherBoxes = container.querySelectorAll('input[type="checkbox"]:not([value="perhe"])');
        otherBoxes.forEach(box => box.checked = e.target.checked);
    } else {
        const perheBox = container.querySelector('input[value="perhe"]');
        const otherBoxes = Array.from(container.querySelectorAll('input[type="checkbox"]:not([value="perhe"])'));
        const allChecked = otherBoxes.every(box => box.checked);
        if (perheBox) perheBox.checked = allChecked;
    }
}

// --- DATA: TAPAHTUMAT ---
function lataaTapahtumat() {
    const eventsRef = ref(database, 'tapahtumat');
    unsubscribeEvents = onValue(eventsRef, (snapshot) => {
        kaikkiTapahtumat = [];
        snapshot.forEach(child => {
            kaikkiTapahtumat.push({ key: child.key, ...child.val() });
        });
        piirraKalenteri();
        naytaTulevatTapahtumat();
    });
}

// --- KALENTERIN PIIRTO ---
function piirraKalenteri() {
    elements.grid.innerHTML = '';
    elements.dayHeaders.innerHTML = '';
    
    elements.dayHeaders.insertAdjacentHTML('beforeend', '<div class="viikonpaiva"></div>');
    ['Ma', 'Ti', 'Ke', 'To', 'Pe', 'La', 'Su'].forEach(p => 
        elements.dayHeaders.insertAdjacentHTML('beforeend', `<div class="viikonpaiva">${p}</div>`)
    );

    const vuosi = nykyinenPaiva.getFullYear();
    const kuukausi = nykyinenPaiva.getMonth();
    const kuukaudet = ['Tammikuu','Helmikuu','Maaliskuu','Huhtikuu','Toukokuu','Kesäkuu','Heinäkuu','Elokuu','Syyskuu','Lokakuu','Marraskuu','Joulukuu'];
    elements.monthTitle.textContent = `${kuukaudet[kuukausi]} ${vuosi}`;

    const ekaPva = new Date(vuosi, kuukausi, 1);
    const paivaViikossa = ekaPva.getDay() === 0 ? 7 : ekaPva.getDay();
    const aloitusPva = new Date(ekaPva);
    aloitusPva.setDate(ekaPva.getDate() - (paivaViikossa - 1));

    const nyt = new Date();
    const tanaanStr = `${nyt.getFullYear()}-${String(nyt.getMonth()+1).padStart(2,'0')}-${String(nyt.getDate()).padStart(2,'0')}`;
    let pvaLaskuri = new Date(aloitusPva);

    for (let i = 0; i < 6; i++) {
        elements.grid.insertAdjacentHTML('beforeend', `<div class="viikko-nro">${getViikkoNumero(pvaLaskuri)}</div>`);
        for (let j = 0; j < 7; j++) {
            const pvmStr = `${pvaLaskuri.getFullYear()}-${String(pvaLaskuri.getMonth()+1).padStart(2,'0')}-${String(pvaLaskuri.getDate()).padStart(2,'0')}`;
            let luokat = "paiva";
            if (pvaLaskuri.getMonth() !== kuukausi) luokat += " tyhja";
            if (pvmStr === tanaanStr) luokat += " tanaan";

            const paivaDiv = document.createElement('div');
            paivaDiv.className = luokat;
            paivaDiv.dataset.paivamaara = pvmStr;
            paivaDiv.innerHTML = `<div class="paiva-numero">${pvaLaskuri.getDate()}</div><div class="tapahtumat-container"></div>`;
            
            paivaDiv.addEventListener('click', (e) => {
                if(e.target === paivaDiv || e.target.classList.contains('paiva-numero')) {
                    const alkuaika = document.getElementById('tapahtuma-alku');
                    const loppuaika = document.getElementById('tapahtuma-loppu');
                    const valittuPvm = paivaDiv.dataset.paivamaara;
                    alkuaika.value = valittuPvm + 'T09:00';
                    loppuaika.value = valittuPvm + 'T10:00';
                    elements.sidebar.classList.remove('hidden');
                }
            });

            elements.grid.appendChild(paivaDiv);
            pvaLaskuri.setDate(pvaLaskuri.getDate() + 1);
        }
        if (pvaLaskuri.getMonth() !== kuukausi && pvaLaskuri.getDay() === 1) break;
    }
    lisaaMerkinnatKalenteriin();
}

function lisaaMerkinnatKalenteriin() {
    if (!kaikkiTapahtumat.length) return;
    kaikkiTapahtumat.forEach(tapahtuma => {
        const alku = new Date(tapahtuma.alku);
        const loppu = new Date(tapahtuma.loppu);
        const pvmStr = alku.toISOString().split('T')[0];
        
        const paivaSolu = document.querySelector(`.paiva[data-paivamaara="${pvmStr}"] .tapahtumat-container`);
        if (paivaSolu) {
            const el = document.createElement('div');
            const varit = haeTapahtumanVarit(tapahtuma.ketakoskee);
            
            if (tapahtuma.kokoPaiva || (loppu - alku > 86400000)) {
                el.className = 'tapahtuma-palkki';
                el.textContent = tapahtuma.otsikko;
                el.style.background = varit.bg;
            } else {
                el.className = 'tapahtuma-kuvake';
                el.textContent = tapahtuma.otsikko.charAt(0);
                el.style.background = varit.bg;
            }
            
            el.title = tapahtuma.otsikko;
            el.addEventListener('click', (e) => {
                e.stopPropagation();
                avaaTapahtumaIkkuna(tapahtuma);
            });
            paivaSolu.appendChild(el);
        }
    });
}

function haeTapahtumanVarit(ketakoskee) {
    let kohteet = Array.isArray(ketakoskee) ? ketakoskee : [ketakoskee];
    if (kohteet.includes('perhe') || kohteet.length > 2) {
        return { bg: DEFAULT_CONFIG.defaultColor };
    }
    if (kohteet.length === 1) {
        const uid = kohteet[0];
        const user = perheenJasenet[uid];
        return { bg: user ? user.vari : '#888' };
    }
    if (kohteet.length === 2) {
        const c1 = perheenJasenet[kohteet[0]]?.vari || '#888';
        const c2 = perheenJasenet[kohteet[1]]?.vari || '#888';
        return { bg: `linear-gradient(45deg, ${c1}, ${c2})` };
    }
    return { bg: '#888' };
}

function getViikkoNumero(d) {
    d = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
}

// --- TULEVAT TAPAHTUMAT ---
function naytaTulevatTapahtumat() {
    const lista = elements.upcomingList;
    lista.innerHTML = '';
    
    const hakutermi = elements.searchField.value.toLowerCase();
    const aktiivinenSuodatin = document.querySelector('.filter-btn.active')?.dataset.filter || 'kaikki';
    const nyt = new Date();

    const suodatetut = kaikkiTapahtumat.filter(t => {
        if (new Date(t.loppu) < nyt) return false;
        if (hakutermi && !t.otsikko.toLowerCase().includes(hakutermi)) return false;

        if (aktiivinenSuodatin !== 'kaikki') {
            const kohteet = Array.isArray(t.ketakoskee) ? t.ketakoskee : [t.ketakoskee];
            if (aktiivinenSuodatin === 'perhe') {
                return kohteet.includes('perhe') || kohteet.length > 1;
            } else {
                return kohteet.includes(aktiivinenSuodatin) || kohteet.includes('perhe');
            }
        }
        return true;
    }).sort((a,b) => new Date(a.alku) - new Date(b.alku));

    const sivuData = suodatetut.slice(tulevatSivu * TAPAHTUMIA_PER_SIVU, (tulevatSivu + 1) * TAPAHTUMIA_PER_SIVU);
    if (sivuData.length === 0) {
        lista.innerHTML = '<p style="text-align:center;opacity:0.6;">Ei tapahtumia</p>';
        return;
    }

    sivuData.forEach(t => {
        const item = document.createElement('div');
        item.className = 'tuleva-tapahtuma-item';
        
        const varit = haeTapahtumanVarit(t.ketakoskee);
        item.style.borderLeftColor = varit.bg.includes('gradient') ? '#888' : varit.bg;
        
        const pvm = new Date(t.alku).toLocaleDateString('fi-FI', {day:'numeric', month:'numeric'});
        const klo = new Date(t.alku).toLocaleTimeString('fi-FI', {hour:'2-digit', minute:'2-digit'});
        
        const initiaalit = haeInitiaalit(t.ketakoskee);

        item.innerHTML = `
            <div class="tapahtuma-item-luoja" style="background: ${varit.bg}">${initiaalit}</div>
            <div class="tapahtuma-item-tiedot">
                <div class="tapahtuma-item-aika">${pvm} ${t.kokoPaiva ? '' : klo}</div>
                <div class="tapahtuma-item-otsikko">${t.otsikko}</div>
            </div>
        `;
        item.addEventListener('click', () => avaaTapahtumaIkkuna(t));
        lista.appendChild(item);
    });
}

function haeInitiaalit(ketakoskee) {
    let arr = Array.isArray(ketakoskee) ? ketakoskee : [ketakoskee];
    if (arr.includes('perhe')) return 'P';
    if (arr.length > 1) return 'P';
    if (arr.length === 1 && perheenJasenet[arr[0]]) {
        return perheenJasenet[arr[0]].nayttonimi.charAt(0).toUpperCase();
    }
    return '?';
}

function lisaaTapahtuma(e) {
    e.preventDefault();
    const form = e.target;
    
    const ketakoskee = Array.from(form.querySelectorAll('input[name="lisaa-ketakoskee"]:checked')).map(cb => cb.value);
    const nakyvyys = Array.from(form.querySelectorAll('input[name="nakyvyys"]:checked')).map(cb => cb.value);

    if (ketakoskee.length === 0) return alert("Valitse ketä tapahtuma koskee!");

    const uusi = {
        otsikko: document.getElementById('tapahtuma-otsikko').value,
        kuvaus: document.getElementById('tapahtuma-kuvaus').value,
        alku: document.getElementById('tapahtuma-alku').value,
        loppu: document.getElementById('tapahtuma-loppu').value,
        kokoPaiva: document.getElementById('tapahtuma-koko-paiva').checked,
        linkki: document.getElementById('tapahtuma-linkki').value,
        luoja: nykyinenKayttaja,
        ketakoskee: ketakoskee,
        nakyvyys: nakyvyys
    };

    push(ref(database, 'tapahtumat'), uusi).then(() => {
        form.reset();
        elements.sidebar.classList.add('hidden');
        alert('Tapahtuma lisätty!');
    });
}

function avaaTapahtumaIkkuna(t) {
    document.getElementById('view-otsikko').textContent = t.otsikko;
    document.getElementById('view-kuvaus').textContent = t.kuvaus || '-';
    
    const nimet = (Array.isArray(t.ketakoskee) ? t.ketakoskee : [t.ketakoskee])
        .map(uid => uid === 'perhe' ? 'Koko perhe' : (perheenJasenet[uid]?.nayttonimi || 'Tuntematon'))
        .join(', ');
    document.getElementById('view-koskee').textContent = nimet;
    
    document.getElementById('view-luoja').textContent = t.luoja;
    
    const linkkiDiv = document.getElementById('view-linkki-container');
    const linkkiA = document.getElementById('view-linkki');
    if(t.linkki) {
        linkkiDiv.classList.remove('hidden');
        linkkiA.href = t.linkki;
    } else {
        linkkiDiv.classList.add('hidden');
    }

    document.getElementById('muokkaa-tapahtuma-id').value = t.key;
    document.getElementById('muokkaa-tapahtuma-otsikko').value = t.otsikko;
    document.getElementById('muokkaa-tapahtuma-kuvaus').value = t.kuvaus || '';
    document.getElementById('muokkaa-tapahtuma-alku').value = t.alku;
    document.getElementById('muokkaa-tapahtuma-loppu').value = t.loppu;
    document.getElementById('muokkaa-tapahtuma-koko-paiva').checked = t.kokoPaiva;
    document.getElementById('muokkaa-tapahtuma-linkki').value = t.linkki || '';

    const checkBoxes = document.querySelectorAll('input[name="muokkaa-ketakoskee"]');
    const arr = Array.isArray(t.ketakoskee) ? t.ketakoskee : [t.ketakoskee];
    checkBoxes.forEach(cb => cb.checked = arr.includes(cb.value));

    elements.eventModal.classList.remove('hidden');
    document.getElementById('modal-view-content').classList.remove('hidden');
    document.getElementById('modal-edit-content').classList.add('hidden');
}

// Muokkaus napit
document.getElementById('muokkaa-btn').addEventListener('click', () => {
    document.getElementById('modal-view-content').classList.add('hidden');
    document.getElementById('modal-edit-content').classList.remove('hidden');
});

document.getElementById('peruuta-muokkaus-btn').addEventListener('click', () => {
    document.getElementById('modal-edit-content').classList.add('hidden');
    document.getElementById('modal-view-content').classList.remove('hidden');
});

document.getElementById('tallenna-muutokset-btn').addEventListener('click', () => {
    const key = document.getElementById('muokkaa-tapahtuma-id').value;
    const form = document.getElementById('muokkaa-tapahtuma-lomake');
    const ketakoskee = Array.from(form.querySelectorAll('input[name="muokkaa-ketakoskee"]:checked')).map(cb => cb.value);
    
    const updates = {
        otsikko: document.getElementById('muokkaa-tapahtuma-otsikko').value,
        kuvaus: document.getElementById('muokkaa-tapahtuma-kuvaus').value,
        alku: document.getElementById('muokkaa-tapahtuma-alku').value,
        loppu: document.getElementById('muokkaa-tapahtuma-loppu').value,
        kokoPaiva: document.getElementById('muokkaa-tapahtuma-koko-paiva').checked,
        linkki: document.getElementById('muokkaa-tapahtuma-linkki').value,
        ketakoskee: ketakoskee
    };
    
    update(ref(database, `tapahtumat/${key}`), updates).then(() => {
        elements.eventModal.classList.add('hidden');
    });
});

document.getElementById('poista-tapahtuma-btn').addEventListener('click', () => {
    if(confirm("Poistetaanko tapahtuma?")) {
        const key = document.getElementById('muokkaa-tapahtuma-id').value;
        remove(ref(database, `tapahtumat/${key}`)).then(() => {
            elements.eventModal.classList.add('hidden');
        });
    }
});

// --- TEHTÄVÄLISTA ---
function lataaTehtavat() {
    const tasksRef = ref(database, 'tehtavalista');
    unsubscribeTasks = onValue(tasksRef, (snapshot) => {
        kaikkiTehtavat = [];
        snapshot.forEach(child => {
            kaikkiTehtavat.push({ key: child.key, ...child.val() });
        });
        piirraTehtavalista();
    });
}

function piirraTehtavalista() {
    const container = elements.taskListContainer;
    container.innerHTML = '';
    const avoimet = kaikkiTehtavat.filter(t => t.tila !== 'arkistoitu').sort((a,b) => a.tehty - b.tehty);
    document.getElementById('avoimet-tehtavat-laskuri').textContent = `${avoimet.filter(t=>!t.tehty).length} avointa`;

    if (avoimet.length === 0) {
        container.innerHTML = '<p style="opacity:0.5; text-align:center;">Ei tehtäviä</p>';
        return;
    }

    avoimet.forEach(t => {
        const div = document.createElement('div');
        div.className = `tehtava-item ${t.tehty ? 'status-tehty' : 'status-ok'}`;
        
        let kohdistusHTML = '';
        if (t.kohdistettu) {
            t.kohdistettu.forEach(uid => {
                const user = perheenJasenet[uid];
                if(user) {
                    kohdistusHTML += `<div class="user-color-circle" style="background:${user.vari}; width:20px; height:20px; display:inline-block; margin-right:2px;" title="${user.nayttonimi}"></div>`;
                }
            });
        }

        div.innerHTML = `
            <div class="tehtava-vasen">
                <input type="checkbox" ${t.tehty ? 'checked' : ''}>
                <div>
                    <p class="tehtava-teksti">${t.teksti}</p>
                    <small style="opacity:0.7">${t.maarapaiva ? new Date(t.maarapaiva).toLocaleDateString() : ''}</small>
                </div>
            </div>
            <div class="tehtava-oikea">
                ${kohdistusHTML}
                <button class="icon-btn" style="font-size:1em">🗑️</button>
            </div>
        `;

        const cb = div.querySelector('input[type="checkbox"]');
        cb.addEventListener('change', () => {
            update(ref(database, `tehtavalista/${t.key}`), { tehty: cb.checked });
        });

        const delBtn = div.querySelector('button');
        delBtn.addEventListener('click', () => {
            if(confirm("Siirretäänkö arkistoon?")) {
                update(ref(database, `tehtavalista/${t.key}`), { tila: 'arkistoitu' });
            }
        });

        container.appendChild(div);
    });
}

function lisaaTehtava() {
    const teksti = elements.taskInput.value.trim();
    if (!teksti) return;

    const kohdistettu = Array.from(document.querySelectorAll('#lisaa-tehtava-henkilot .assign-btn.active')).map(b => b.dataset.assignee);
    const maarapaiva = document.getElementById('lisaa-maarapaiva-toggle').checked 
        ? document.getElementById('uusi-tehtava-maarapaiva').value 
        : null;

    push(ref(database, 'tehtavalista'), {
        teksti,
        kohdistettu,
        maarapaiva,
        tehty: false,
        luoja: nykyinenKayttaja,
        lisatty: serverTimestamp(),
        tila: 'aktiivinen'
    }).then(() => {
        elements.taskInput.value = '';
        document.querySelectorAll('.assign-btn').forEach(b => b.classList.remove('active'));
    });
}

elements.openArchiveBtn.addEventListener('click', () => {
    const list = document.getElementById('arkistoidut-tehtavat-lista');
    list.innerHTML = '';
    elements.archiveModal.classList.remove('hidden');
    
    const arkistoidut = kaikkiTehtavat.filter(t => t.tila === 'arkistoitu');
    arkistoidut.forEach(t => {
        const div = document.createElement('div');
        div.style.padding = '10px';
        div.style.borderBottom = '1px solid rgba(255,255,255,0.1)';
        div.innerHTML = `<span>${t.teksti}</span> <button style="float:right; width:auto; padding:2px 8px;">Palauta</button>`;
        div.querySelector('button').addEventListener('click', () => {
            update(ref(database, `tehtavalista/${t.key}`), { tila: 'aktiivinen' });
            elements.archiveModal.classList.add('hidden');
        });
        list.appendChild(div);
    });
});

document.getElementById('sulje-arkisto-modal-btn').addEventListener('click', () => elements.archiveModal.classList.add('hidden'));
document.getElementById('logout-btn').addEventListener('click', () => { signOut(auth); });
