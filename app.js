// Простой frontend с Firebase Realtime Database (модульный импорт)
import { initializeApp } from 'https://www.gstatic.com/firebasejs/9.22.2/firebase-app.js'
import { getAuth, onAuthStateChanged, signInAnonymously } from 'https://www.gstatic.com/firebasejs/9.22.2/firebase-auth.js'
import { getDatabase, ref, onValue, get, runTransaction } from 'https://www.gstatic.com/firebasejs/9.22.2/firebase-database.js'

/*
  ВАЖНО: Замените конфиг на ваш Firebase проект.
  Этот файл реализует:
  - загрузку списка ботов
  - проверку и присвоение незанятых ботов текущему (анонимному) пользователю
  - синхронизацию в реальном времени
  - немедленное обновление панели "Мои боты" после успешного захвата
*/
const firebaseConfig = {
  apiKey: "AIzaSyCRN1rMd6XXPHnyhbZ69gb8MprBId_Hn1Q",
  authDomain: "scripdq.firebaseapp.com",
  databaseURL: "https://scripdq-default-rtdb.firebaseio.com",
  projectId: "scripdq",
  storageBucket: "scripdq.firebasestorage.app",
  messagingSenderId: "881267589716",
  appId: "1:881267589716:web:8d45b390d03a76abeb23c1"
}

const app = initializeApp(firebaseConfig)
const auth = getAuth(app)
const db = getDatabase(app)

let currentUser = { uid: null }
const ownedBots = new Set()
let latestData = null

signInAnonymously(auth).catch((e)=>console.error('auth err',e))
onAuthStateChanged(auth, user => {
  if (user){ currentUser.uid = user.uid; console.log('uid', user.uid); if(latestData) renderMyBots(latestData) }
})

// DOM
const botsInput = document.getElementById('botsInput')
const uploadList = document.getElementById('uploadList')
const botsListEl = document.getElementById('botsList')
const checkBtn = document.getElementById('checkBtn')
const myBotsBtn = document.getElementById('myBotsBtn')
const myBotsPanel = document.getElementById('myBotsPanel')
const closeMyBots = document.getElementById('closeMyBots')
const myBotsList = document.getElementById('myBotsList')

function keyFromName(name){ return encodeURIComponent(name.trim().toLowerCase()) }

uploadList.addEventListener('click', async ()=>{
  const lines = botsInput.value.split('\n').map(l=>l.trim()).filter(Boolean)
  if(lines.length===0){ alert('Вставьте хотя бы один бот'); return }
  for(const name of lines){
    const key = keyFromName(name)
    const botRef = ref(db,`/bots/${key}`)
    try{
      await runTransaction(botRef, cur=>{ if(cur===null) return { name, createdAt: Date.now() }; return cur })
    }catch(e){
      console.error('Failed to create bot', e)
      if(String(e).toLowerCase().includes('permission')){
        alert('Ошибка доступа к Firebase: проверьте правила Realtime Database и включите Anonymous Auth или откройте правила (см. README).')
        return
      }
    }
  }
  alert('Список загружен. Нажмите "Проверить" для проверки статусов.')
})

const allBotsRef = ref(db,'/bots')
onValue(allBotsRef, snapshot=>{
  const data = snapshot.val() || {}
  latestData = data
  renderBots(data)
  renderMyBots(data)
}, err=>{
  console.error('onValue error', err)
  if(String(err).toLowerCase().includes('permission')){
    alert('Ошибка доступа к Firebase при подписке на /bots: проверьте правила Realtime Database (см. README).')
  }
})

function renderBots(data){
  const arr = Object.entries(data)
  if(arr.length===0){ botsListEl.innerHTML='(пусто)'; return }
  botsListEl.innerHTML = ''
  for(const [key, bot] of arr){
    const div = document.createElement('div'); div.className = 'bot-item'
    const name = document.createElement('div'); name.textContent = bot.name || decodeURIComponent(key)
    const right = document.createElement('div')
    const badge = document.createElement('span'); badge.className = 'badge'
    if(!bot.ownerId){ badge.classList.add('free'); badge.textContent = 'свободен' }
    else if(bot.ownerId === currentUser.uid){ badge.classList.add('free'); badge.textContent = 'принадлежит вам' }
    else { badge.classList.add('busy'); badge.textContent = 'занят' }
    right.appendChild(badge)
    div.appendChild(name); div.appendChild(right)
    botsListEl.appendChild(div)
  }
}

function renderMyBots(data){
  myBotsList.innerHTML = ''
  if(!currentUser.uid){ myBotsList.innerHTML = '<div class="small-muted">У вас пока нет ботов</div>'; return }
  const arr = Object.entries(data).filter(([k,v])=>v && v.ownerId === currentUser.uid)
  ownedBots.clear()
  for(const [k,v] of arr) ownedBots.add(k)
  if(ownedBots.size === 0){ myBotsList.innerHTML = '<div class="small-muted">У вас пока нет ботов</div>'; return }
  for(const key of ownedBots){
    const bot = data[key]
    const name = bot ? (bot.name || decodeURIComponent(key)) : decodeURIComponent(key)
    const d = document.createElement('div'); d.className='bot-item'; d.textContent = name
    myBotsList.appendChild(d)
  }
}

function addToMyBotsPanel(name){
  const exists = Array.from(myBotsList.children).some(ch => ch.textContent === name)
  if(exists) return
  if(myBotsList.querySelector('.small-muted')) myBotsList.innerHTML = ''
  const d = document.createElement('div'); d.className='bot-item'; d.textContent = name
  myBotsList.appendChild(d)
}

checkBtn.addEventListener('click', async ()=>{
  try{
    const snap = await get(allBotsRef)
    const snapshotData = snap.val() || {}
    const entries = Object.entries(snapshotData)
    if(entries.length===0){ alert('Список ботов пуст. Сначала загрузите список.'); return }
    for(const [key, bot] of entries){
      const botRef = ref(db,`/bots/${key}`)
      try{
        const txRes = await runTransaction(botRef, cur=>{
          if(cur===null) return { name: bot.name || decodeURIComponent(key), ownerId: currentUser.uid, claimedAt: Date.now() }
          if(!cur.ownerId){ cur.ownerId = currentUser.uid; cur.claimedAt = Date.now(); return cur }
          return cur
        })
        if(txRes && txRes.committed){
          const final = txRes.snapshot ? txRes.snapshot.val() : null
          const ownerId = final ? final.ownerId : (bot.ownerId || null)
          if(ownerId && ownerId === currentUser.uid){
            ownedBots.add(key)
            addToMyBotsPanel(final ? final.name || decodeURIComponent(key) : decodeURIComponent(key))
          }
        }
      }catch(e){
        console.warn('tx failed',e)
        if(String(e).toLowerCase().includes('permission')){
          alert('Ошибка доступа при попытке присвоить бота: проверьте правила Realtime Database и права на запись.')
          return
        }
      }
    }
    alert('Проверка завершена — статусы обновлены.')
  }catch(e){
    console.error('Failed to get bots', e)
    if(String(e).toLowerCase().includes('permission')){
      alert('Ошибка доступа к Firebase: проверьте правила Realtime Database (см. README).')
    }
  }
})

myBotsBtn.addEventListener('click', ()=>{ myBotsPanel.classList.remove('hidden') })
closeMyBots.addEventListener('click', ()=>{ myBotsPanel.classList.add('hidden') })

// Простой frontend с Firebase Realtime Database (модульный импорт)
import { initializeApp } from 'https://www.gstatic.com/firebasejs/9.22.2/firebase-app.js'
import { getAuth, onAuthStateChanged, signInAnonymously } from 'https://www.gstatic.com/firebasejs/9.22.2/firebase-auth.js'
import { getDatabase, ref, onValue, get, set, update, runTransaction } from 'https://www.gstatic.com/firebasejs/9.22.2/firebase-database.js'

/*
  ВАЖНО: Замените конфиг на ваш Firebase проект.
  Создайте Realtime Database и установите правила (для теста можно открыть):
  {
    "rules": {
      ".read": true,
      ".write": true
    }
  }
*/
const firebaseConfig = {
  apiKey: "AIzaSyCRN1rMd6XXPHnyhbZ69gb8MprBId_Hn1Q",
  authDomain: "scripdq.firebaseapp.com",
  databaseURL: "https://scripdq-default-rtdb.firebaseio.com",
  projectId: "scripdq",
  storageBucket: "scripdq.firebasestorage.app",
  messagingSenderId: "881267589716",
  appId: "1:881267589716:web:8d45b390d03a76abeb23c1"
}

const app = initializeApp(firebaseConfig)
const auth = getAuth(app)
const db = getDatabase(app)

let currentUser = { uid: null }
// Local cache of bots owned by this user for instant UI updates
const ownedBots = new Set()

// Anonymous sign-in
signInAnonymously(auth).catch((e)=>console.error('auth err',e))
onAuthStateChanged(auth,user=>{ if(user){ currentUser.uid = user.uid; console.log('uid',user.uid) } })

function waitForUser(timeout = 5000) {
  return new Promise((resolve) => {
    if (currentUser.uid) return resolve(currentUser)
    const unsub = onAuthStateChanged(auth, user => {
      if (user) { currentUser.uid = user.uid; unsub(); return resolve(currentUser) }
    })
  })
}

// DOM
const botsInput = document.getElementById('botsInput')
const uploadList = document.getElementById('uploadList')
const botsListEl = document.getElementById('botsList')
const checkBtn = document.getElementById('checkBtn')
const myBotsBtn = document.getElementById('myBotsBtn')
const myBotsPanel = document.getElementById('myBotsPanel')
const closeMyBots = document.getElementById('closeMyBots')
const myBotsList = document.getElementById('myBotsList')

// Helper to create safe key
function keyFromName(name){
  return encodeURIComponent(name.trim().toLowerCase())
}

// Upload list to DB: create bot entries if not exists (only name stored initially)
uploadList.addEventListener('click', async ()=>{
  const lines = botsInput.value.split('\n').map(l=>l.trim()).filter(Boolean)
  if(lines.length===0){ alert('Вставьте хотя бы один бот'); return }
  for(const name of lines){
    const key = keyFromName(name)
    const botRef = ref(db,`/bots/${key}`)
    // create basic entry if not exists
    try{
      await runTransaction(botRef, cur=>{
        if(cur===null) return { name, createdAt: Date.now() }
        return cur
      })
    }catch(e){
      console.error('Failed to create bot', e)
      if(String(e).toLowerCase().includes('permission')){
        alert('Ошибка доступа к Firebase: проверьте правила Realtime Database и включите Anonymous Auth или откройте правила для теста (см. README).')
        return
      }
    }
  }
  alert('Список загружен. Нажмите "Проверить" для проверки статусов.')
})

// We'll initialize realtime listeners after auth (so anonymous uid is available for rendering)
const allBotsRef = ref(db,'/bots')

async function startRealtime() {
  await waitForUser()
  onValue(allBotsRef, snapshot=>{
    const data = snapshot.val() || {}
    renderBots(data)
  // Keep latestData cache so we can re-render quickly when auth changes
  let latestData = null
  // Start realtime listener immediately (no artificial wait)
  onValue(allBotsRef, snapshot=>{
    const data = snapshot.val() || {}
    latestData = data
    renderBots(data)
    renderMyBots(data)
  }, err=>{
    console.error('onValue error', err)
    if(String(err).toLowerCase().includes('permission')){
      alert('Ошибка доступа к Firebase при подписке на /bots: проверьте правила Realtime Database (см. README).')
    }
  })
  for(const [key, bot] of arr){
    const div = document.createElement('div')
    div.className = 'bot-item'
    const name = document.createElement('div')
    name.textContent = bot.name || decodeURIComponent(key)
    const right = document.createElement('div')
    const badge = document.createElement('span')
    badge.className = 'badge'
    if(!bot.ownerId){ badge.classList.add('free'); badge.textContent = 'свободен' }
    else if(bot.ownerId === currentUser.uid){ badge.classList.add('free'); badge.textContent = 'принадлежит вам' }
    else { badge.classList.add('busy'); badge.textContent = 'занят' }
    right.appendChild(badge)
    div.appendChild(name)
    div.appendChild(right)
    botsListEl.appendChild(div)
  }
}

function renderMyBots(data){
  const arr = Object.entries(data).filter(([k,v])=>v && v.ownerId === currentUser.uid)
  myBotsList.innerHTML = ''
  if(arr.length===0){ myBotsList.innerHTML = '<div class="small-muted">У вас пока нет ботов</div>'; return }
  for(const [k,b] of arr){
    const d = document.createElement('div'); d.className='bot-item'; d.textContent = b.name || decodeURIComponent(k)
    myBotsList.innerHTML = ''
    // prefer local ownedBots set for immediate items, but also reflect DB truth
    const arr = Object.entries(data).filter(([k,v])=>v && v.ownerId === currentUser.uid)
    // update ownedBots set from the authoritative DB
    ownedBots.clear()
    for(const [k,v] of arr){ ownedBots.add(k) }
    if(ownedBots.size === 0){ myBotsList.innerHTML = '<div class="small-muted">У вас пока нет ботов</div>'; return }
    for(const key of ownedBots){
      const bot = data[key]
      const name = bot ? (bot.name || decodeURIComponent(key)) : decodeURIComponent(key)
      const d = document.createElement('div'); d.className='bot-item'; d.textContent = name
      myBotsList.appendChild(d)
    }
  try{
    const snap = await get(allBotsRef)
  function addToMyBotsPanel(name){
    // ensure panel exists and add a single item if not already present
    const exists = Array.from(myBotsList.children).some(ch => ch.textContent === name)
    if(exists) return
    // If panel shows 'У вас пока нет ботов', clear it
    if(myBotsList.querySelector('.small-muted')) myBotsList.innerHTML = ''
    const d = document.createElement('div'); d.className='bot-item'; d.textContent = name
    myBotsList.appendChild(d)
  }
    const snapshotData = snap.val() || {}
    const entries = Object.entries(snapshotData)
    if(entries.length===0){ alert('Список ботов пуст. Сначала загрузите список.'); return }
    // await waitForUser() // Removed artificial wait
      const botRef = ref(db,`/bots/${key}`)
      try{
        await runTransaction(botRef, cur=>{
          if(cur===null) return { name: bot.name || decodeURIComponent(key), ownerId: currentUser.uid, claimedAt: Date.now() }
          if(!cur.ownerId){ cur.ownerId = currentUser.uid; cur.claimedAt = Date.now(); return cur }
          return cur
        })
      }catch(e){
          const txRes = await runTransaction(botRef, cur=>{
            if(cur===null) return { name: bot.name || decodeURIComponent(key), ownerId: currentUser.uid, claimedAt: Date.now() }
            if(!cur.ownerId){ cur.ownerId = currentUser.uid; cur.claimedAt = Date.now(); return cur }
            return cur
          })
          // If transaction committed and ownerId equals current user's uid, update local ownedBots and panel immediately
          if(txRes && txRes.committed){
            const final = txRes.snapshot ? txRes.snapshot.val() : null
            const ownerId = final ? final.ownerId : (bot.ownerId || null)
            if(ownerId && ownerId === currentUser.uid){
              ownedBots.add(key)
              addToMyBotsPanel(final ? final.name || decodeURIComponent(key) : decodeURIComponent(key))
            }
          }
      }
    }
    alert('Проверка завершена — статусы обновлены.')
  }catch(e){
    console.error('Failed to get bots', e)
    if(String(e).toLowerCase().includes('permission')){
      alert('Ошибка доступа к Firebase: проверьте правила Realtime Database (см. README).')
    }
  }
})

// My bots panel
myBotsBtn.addEventListener('click', ()=>{ myBotsPanel.classList.remove('hidden') })
closeMyBots.addEventListener('click', ()=>{ myBotsPanel.classList.add('hidden') })
