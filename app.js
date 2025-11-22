// Простой frontend с Firebase Realtime Database (модульный импорт)
import { initializeApp } from 'https://www.gstatic.com/firebasejs/9.22.2/firebase-app.js'
import { getAuth, onAuthStateChanged, signInAnonymously } from 'https://www.gstatic.com/firebasejs/9.22.2/firebase-auth.js'
import { getDatabase, ref, onValue, set, update, runTransaction } from 'https://www.gstatic.com/firebasejs/9.22.2/firebase-database.js'

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

// Anonymous sign-in
signInAnonymously(auth).catch((e)=>console.error('auth err',e))
onAuthStateChanged(auth,user=>{ if(user){ currentUser.uid = user.uid; console.log('uid',user.uid) } })

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
    await runTransaction(botRef, cur=>{
      if(cur===null) return { name, createdAt: Date.now() }
      return cur
    })
  }
  alert('Список загружен. Нажмите "Проверить" для проверки статусов.')
})

// Real-time listener: render bots on change
const allBotsRef = ref(db,'/bots')
onValue(allBotsRef, snapshot=>{
  const data = snapshot.val() || {}
  renderBots(data)
  renderMyBots(data)
})

function renderBots(data){
  const arr = Object.entries(data)
  if(arr.length===0){ botsListEl.innerHTML='(пусто)'; return }
  botsListEl.innerHTML = ''
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
    myBotsList.appendChild(d)
  }
}

// When user clicks 'Проверить', check all bots; unclaimed bots will be automatically присвоены текущему пользователю
checkBtn.addEventListener('click', async ()=>{
  // read snapshot once
  const snapshot = (await import('https://www.gstatic.com/firebasejs/9.22.2/firebase-database.js')).get(ref(db,'/bots'))
  // For simplicity, we will iterate current client-local view (onValue keeps it up-to-date)
  const snapshotData = (await new Promise(res=>{ onValue(allBotsRef, s=>{ res(s.val()||{}); }, { onlyOnce:true }) }))
  const entries = Object.entries(snapshotData)
  if(entries.length===0){ alert('Список ботов пуст. Сначала загрузите список.'); return }
  for(const [key, bot] of entries){
    const botRef = ref(db,`/bots/${key}`)
    try{
      await runTransaction(botRef, cur=>{
        if(cur===null) return { name: bot.name || decodeURIComponent(key), ownerId: currentUser.uid, claimedAt: Date.now() }
        if(!cur.ownerId){ cur.ownerId = currentUser.uid; cur.claimedAt = Date.now(); return cur }
        return cur
      })
    }catch(e){ console.warn('tx failed',e) }
  }
  alert('Проверка завершена — статусы обновлены.')
})

// My bots panel
myBotsBtn.addEventListener('click', ()=>{ myBotsPanel.classList.remove('hidden') })
closeMyBots.addEventListener('click', ()=>{ myBotsPanel.classList.add('hidden') })
