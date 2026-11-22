const assert = require('node:assert/strict')
const {test} = require('node:test')
const path = require('node:path')
const vm = require('node:vm')
const EventEmitter = require('eventemitter3')
const {bindWindowAudio} = require(path.join(process.env.LINDO_TEST_BUILD,'window-audio.js'))
const {WindowOptionModel} = require(path.join(process.env.LINDO_TEST_BUILD,'window-options.js'))
const {prepareGameAudio} = require(path.join(process.env.LINDO_TEST_BUILD,'game-patches.js'))
const {createTabPortrait} = require(path.join(process.env.LINDO_TEST_BUILD,'tab-portrait.js'))

const audioWindow = (t, initial = {}) => {
  const win = new EventEmitter()
  let focused = true
  let manualMute = false
  const calls = []
  win.isFocused = () => focused
  win.webContents = {setAudioMuted: value => calls.push(value)}
  const options = WindowOptionModel.create(initial)
  const controller = bindWindowAudio(win, options, () => manualMute)
  t.after(controller.dispose)
  return {
    win, options, controller, calls,
    focus: value => {focused = value; win.emit(value ? 'focus' : 'blur')},
    mute: value => {manualMute = value; controller.update()},
    get muted() {return calls.at(-1)}
  }
}

test('background audio stays audible when foreground-only sound is disabled', (t) => {
  const state = audioWindow(t,{soundOnFocus:false})
  state.focus(false)
  assert.equal(state.muted,false)
  state.focus(true)
  assert.equal(state.muted,false)
})

test('foreground-only sound mutes output and changing the setting while hidden applies immediately', (t) => {
  const state = audioWindow(t)
  assert.equal(state.muted,false)
  state.focus(false)
  assert.equal(state.muted,true)
  state.options.setSoundOnFocus(false)
  assert.equal(state.muted,false)
  state.options.setSoundOnFocus(true)
  assert.equal(state.muted,true)
  state.focus(true)
  assert.equal(state.muted,false)
})

test('master mute and per-window mute remain independent of background and focus preferences', (t) => {
  const state = audioWindow(t,{soundOnFocus:false})
  state.options.setAudioMuted(true)
  state.focus(false)
  assert.equal(state.muted,true)
  state.mute(true)
  state.options.setAudioMuted(false)
  state.focus(true)
  assert.equal(state.muted,true)
  state.mute(false)
  assert.equal(state.muted,false)
})

test('closing the audio controller removes only its own handlers and stops observing preferences', (t) => {
  const state = audioWindow(t)
  const other = () => {}
  state.win.on('focus',other)
  state.controller.dispose()
  const before = state.calls.length
  state.options.setAudioMuted(true)
  state.focus(false)
  state.focus(true)
  assert.equal(state.calls.length,before)
  assert.equal(state.win.listenerCount('focus'),1)
  assert.equal(state.win.listenerCount('blur'),0)
})

// Synthetic fixture of only the mobile audio lifecycle hooks, not the game bundle.
const oldAudio = `function registerAudio() {
  window.gui.on("appGoBackground", function() {
    sound.setMute(!0)
  }), window.gui.on("appLeaveBackground", function() {
    sound.setMute(!1)
  }), game.on("gameContextChanged", function() { sound.mapChange() })
}
registerAudio();
window.gui.on("appGoBackground", function() { network.pause() });
window.gui.on("appLeaveBackground", function() { network.resume() });`

test('the desktop patch removes audio loop restarts while preserving the other visibility events', () => {
  let stops = 0
  let mapChanges = 0
  let background = 0
  let foreground = 0
  const gui = new EventEmitter()
  const game = new EventEmitter()
  const source = prepareGameAudio(oldAudio)
  assert.notEqual(source,oldAudio)
  vm.runInNewContext(source,{
    window:{gui}, game,
    sound:{setMute:()=>stops++,mapChange:()=>mapChanges++},
    network:{pause:()=>background++,resume:()=>foreground++}
  })
  gui.emit('appGoBackground')
  gui.emit('appLeaveBackground')
  game.emit('gameContextChanged')
  assert.equal(stops,0)
  assert.equal(background,1)
  assert.equal(foreground,1)
  assert.equal(mapChanges,1)
})

test('an unknown or ambiguous audio implementation is preserved instead of breaking game startup', () => {
  assert.equal(prepareGameAudio('new implementation'),'new implementation')
  assert.equal(prepareGameAudio(oldAudio+oldAudio),oldAudio+oldAudio)
})

const portraitEnvironment = (t,{delayedLook=false,failExport=false} = {}) => {
  let next = 0
  let now = 0
  const timers = new Map()
  const gameDocument = {name:'game'}
  const parentDocument = {name:'lindo',createElement: tag=>({tagName:tag,ownerDocument:parentDocument,style:{}})}
  const images = []
  const errors = []
  const portraits = []
  const host = {
    rootElement:{ownerDocument:gameDocument},
    children:[],
    appendChild(child) {child.parent=host; child.rootElement.parentNode=host.rootElement; host.children.push(child); return child},
    removeChild(child) {host.children.splice(host.children.indexOf(child),1); child.parent=null; child.rootElement.parentNode=null; return child}
  }
  const gameWindow = {
    gui:{wBody:host},
    setTimeout(callback,delay=0) {const id=++next; timers.set(id,{callback,at:now+delay}); return id},
    clearTimeout: id=>timers.delete(id)
  }
  class NativePortrait {
    constructor(options) {
      this.options=options
      this.parent=null
      this.initialized=false
      this.loaded=false
      this.released=false
      this.rootElement={style:{},ownerDocument:gameDocument,parentNode:null}
      this.canvas={rootElement:{width:300,height:150,toDataURL:()=>{
        assert.equal(this.parent,host,'snapshot must be taken inside the game Wui tree')
        assert.equal(this.rootElement.ownerDocument,gameDocument)
        assert.ok(this.initialized && this.loaded)
        assert.equal(this.canvas.rootElement.width,64)
        assert.equal(this.canvas.rootElement.height,64)
        if(failExport) throw new Error('canvas export failed')
        return 'data:image/png;base64,rendered-portrait'
      }}}
      // Same deferred initialization contract as CharacterDisplay in the current game.
      gameWindow.setTimeout(()=>{this.initialized=true; this.resize()},0)
      portraits.push(this)
    }
    resize() {
      if(this.parent !== host || !this.initialized) return
      this.canvas.rootElement.width=parseInt(this.rootElement.style.width)
      this.canvas.rootElement.height=parseInt(this.rootElement.style.height)
    }
    setLook(_look,_options,callback) {
      assert.equal(this.parent,host)
      assert.equal(this.initialized,true)
      const ready=()=>{this.loaded=true; callback()}
      if(delayedLook) this.finishLook=ready
      else ready()
    }
    release() {this.released=true}
  }
  gameWindow.CharacterDisplay=NativePortrait
  const dispose=createTabPortrait(gameWindow,parentDocument,{},image=>images.push(image),error=>errors.push(error))
  t.after(dispose)
  return {
    images,errors,portraits,host,parentDocument,dispose,
    tick(ms=0) {
      now+=ms
      const due=[...timers.entries()].filter(([,task])=>task.at<=now).sort((a,b)=>a[1].at-b[1].at)
      for(const [id,{callback}] of due) {if(timers.delete(id)) callback()}
    },
    get pending() {return timers.size}
  }
}

test('portrait pixels are rendered in the game Wui tree and exported as an image owned by the parent window', (t) => {
  const env=portraitEnvironment(t)
  assert.equal(env.images.length,0)
  env.tick()
  assert.equal(env.errors.length,0)
  assert.equal(env.images.length,1)
  assert.equal(env.images[0].tagName,'img')
  assert.equal(env.images[0].ownerDocument,env.parentDocument)
  assert.equal(env.images[0].src,'data:image/png;base64,rendered-portrait')
  assert.equal(env.images[0].style.objectFit,'contain')
  assert.equal(env.host.children.length,0)
  assert.equal(env.portraits[0].released,true)
  assert.equal(env.pending,0)
})

test('portrait export waits for character assets before publishing an image', (t) => {
  const env=portraitEnvironment(t,{delayedLook:true})
  env.tick()
  assert.equal(env.images.length,0)
  assert.equal(env.host.children.length,1)
  env.portraits[0].finishLook()
  assert.equal(env.images.length,1)
  assert.equal(env.host.children.length,0)
})

test('closing a tab during portrait loading prevents a late image from being published', (t) => {
  const env=portraitEnvironment(t,{delayedLook:true})
  env.tick()
  env.dispose()
  env.portraits[0].finishLook()
  assert.equal(env.images.length,0)
  assert.equal(env.errors.length,0)
  assert.equal(env.host.children.length,0)
  assert.equal(env.pending,0)
})

test('a failed portrait export releases its native resources and reports the error', (t) => {
  const env=portraitEnvironment(t,{failExport:true})
  env.tick()
  assert.equal(env.images.length,0)
  assert.equal(env.errors[0].message,'canvas export failed')
  assert.equal(env.host.children.length,0)
  assert.equal(env.portraits[0].released,true)
})

test('portrait loading has a bounded lifetime when native assets never finish', (t) => {
  const env=portraitEnvironment(t,{delayedLook:true})
  env.tick()
  env.tick(10000)
  assert.equal(env.images.length,0)
  assert.match(env.errors[0].message,/timed out/)
  assert.equal(env.host.children.length,0)
  assert.equal(env.pending,0)
})
