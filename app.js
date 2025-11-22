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

// Anonymous sign-in
signInAnonymously(auth).catch((e)=>console.error('auth err',e))
onAuthStateChanged(auth,user=>{ if(user){ currentUser.uid = user.uid; console.log('uid',user.uid) } })

function waitForUser(timeout = 5000) {
  return new Promise((resolve) => {
    if (currentUser.uid) return resolve(currentUser)
    const unsub = onAuthStateChanged(auth, user => {
      if (user) { currentUser.uid = user.uid; unsub(); return resolve(currentUser) }
    })
    setTimeout(() => resolve(currentUser), timeout)
  })
}

// DOM
const botsInput = document.getElementById('botsInput')
const uploadList = document.getElementById('uploadList')
const botsListEl = document.getElementById('botsList')
const checkBtn = document.getElementById('checkBtn')
const clearListBtn = document.getElementById('clearListBtn')
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
  await waitForUser()
  if(!currentUser.uid){
    // user not authenticated yet — warn but still try (DB rules may allow unauthenticated writes)
    console.warn('UID not available yet; anonymous auth may be disabled in Firebase console')
  }
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
    // record this bot under the current user's uploaded list
    try{
      if(currentUser.uid){
        await set(ref(db,`/users/${currentUser.uid}/lists/${key}`), true)
      }
    }catch(e){
      console.error('Failed to write user list entry', e)
    }
  }
  alert('Список загружен. Нажмите "Проверить" для проверки статусов.')
})

// We'll initialize realtime listeners after auth (so anonymous uid is available for rendering)
const allBotsRef = ref(db,'/bots')
let botsData = {}
let userListKeys = []
let userListRef = null
// Set of keys hidden by the user via "Очистить" — hides current items but keeps them in DB
let hiddenKeys = new Set()

async function startRealtime() {
  await waitForUser()
  // subscribe to global bots
  onValue(allBotsRef, snapshot=>{
    botsData = snapshot.val() || {}
    renderUserBots()
    renderMyBots(botsData)
  }, err=>{
    console.error('onValue error', err)
    if(String(err).toLowerCase().includes('permission')){
      alert('Ошибка доступа к Firebase при подписке на /bots: проверьте правила Realtime Database (см. README).')
    }
  })

  // subscribe to current user's uploaded list
  userListRef = ref(db,`/users/${currentUser.uid}/lists`)
  onValue(userListRef, snap=>{
    const val = snap.val() || {}
    userListKeys = Object.keys(val)
    renderUserBots()
  }, err=>{
    console.error('onValue user lists error', err)
  })
}

startRealtime()

function renderUserBots(){
  // Render only bots that current user uploaded (userListKeys)
  if(!userListKeys || userListKeys.length===0){ botsListEl.innerHTML='(пусто)'; return }
  botsListEl.innerHTML = ''
  for(const key of userListKeys){
    if(hiddenKeys.has(key)) continue // skip visually cleared items
    const bot = botsData[key] || { name: decodeURIComponent(key) }
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
  await waitForUser()
  try{
    // Only check bots from the current user's uploaded list
    if(!currentUser.uid){ alert('Не удалось получить UID пользователя. Проверьте аутентификацию.'); return }
    const userListSnap = await get(ref(db,`/users/${currentUser.uid}/lists`))
    const userList = userListSnap.val() || {}
    const keys = Object.keys(userList)
    if(keys.length===0){ alert('Ваш список ботов пуст. Сначала загрузите список.'); return }
    for(const key of keys){
      const bot = botsData[key] || {}
      const botRef = ref(db,`/bots/${key}`)
      try{
        await runTransaction(botRef, cur=>{
          if(cur===null) return { name: bot.name || decodeURIComponent(key), ownerId: currentUser.uid, claimedAt: Date.now() }
          if(!cur.ownerId){ cur.ownerId = currentUser.uid; cur.claimedAt = Date.now(); return cur }
          return cur
        })
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

// My bots panel
myBotsBtn.addEventListener('click', ()=>{ myBotsPanel.classList.remove('hidden') })
closeMyBots.addEventListener('click', ()=>{ myBotsPanel.classList.add('hidden') })

// Clear (visual) right column: hide current uploaded keys; new uploads appear normally
if (typeof clearListBtn !== 'undefined' && clearListBtn) {
  clearListBtn.addEventListener('click', ()=>{
    if(userListKeys && userListKeys.length>0 && hiddenKeys.size===0){
      // hide current items
      hiddenKeys = new Set(userListKeys)
      clearListBtn.textContent = 'Восстановить'
    }else{
      // restore
      hiddenKeys.clear()
      clearListBtn.textContent = 'Очистить'
    }
    renderUserBots()
  })
}
