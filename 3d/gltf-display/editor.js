
import { Viewer } from './Viewer.js'
import { parseDataTransferItems } from './readFiles.js'
// import { GUI } from 'three/examples/jsm/libs/lil-gui.module.min.js'

const gui = new dat.GUI()

{
  const basicFolder = gui.addFolder('Basic')
  basicFolder.add({
    Home() {
      form.hidden = !form.hidden
    }
  }, 'Home')
  const saveBlob = (function () {
    const a = document.createElement('a')
    document.body.appendChild(a)
    a.style.display = 'none'
    return function saveData(blob, fileName) {
      const url = URL.createObjectURL(blob)
      a.href = url
      a.download = fileName
      a.click()
    }
  }())
  basicFolder.add({
    saveImg() {
      const cleanup = viewer.onRendered(() => {
        canvas.toBlob((blob) => {
          saveBlob(blob, `screencapture-${canvas.width}x${canvas.height}.png`)
        })
        cleanup()
      })
      viewer.render()
    }
  }, 'saveImg')
}

{
  const sceneOptions = { bgColor: '#ffffff', bgOpacity: 1, enableCtrl: true, rotateSpeed: 0 }
  const sceneFolder = gui.addFolder('Scene')
  sceneFolder.addColor(sceneOptions, 'bgColor')
    .onChange((color) => viewer.setBgColor(color, sceneOptions.bgOpacity))
  sceneFolder.add(sceneOptions, 'bgOpacity', 0, 1)
    .onChange((opacity) => viewer.setBgColor(sceneOptions.bgColor, opacity))
  sceneFolder.add(sceneOptions, 'enableCtrl')
    .onChange((e) => viewer.enableCtrl(e))
  sceneFolder.add(sceneOptions, 'rotateSpeed', -100, 100)
    .onChange((e) => viewer.autoRotate(e))
}

{
  const lightOptions = { color: '#ffffff', intensity: 1 }
  const lightFolder = gui.addFolder('Light')
  lightFolder.addColor(lightOptions, 'color')
    .onChange((color) => viewer.setLight({ color }))
  lightFolder.add(lightOptions, 'intensity', 0, 8)
    .onChange((intensity) => viewer.setLight({ intensity }))
}

{
  const modelOptions = { wireFrame: false, boxHelper: false, zoom: 2.0, alpha: 5.0 }
  const modelFolder = gui.addFolder('Model')
  modelFolder.add(modelOptions, 'wireFrame')
    .onChange((v) => viewer.gltfWireFrame(v))
  modelFolder.add(modelOptions, 'boxHelper')
    .onChange((v) => {
      v ? viewer.gltfBoxHelper() : viewer.gltfBoxHelper().dispose()
    })
  modelFolder.add(modelOptions, 'zoom', 0.1, 10)
    .onChange((v) => viewer.gltfAlignCenter({ zoom: v }))
  modelFolder.add(modelOptions, 'alpha', 1, 7)
    .onChange((v) => viewer.gltfAlignCenter({ alpha: v }))
}

let animationsFolder
function addAnimationsGUI(animations) {
  if (!animations?.length) return
  const options = { animation: animations[0].name, playbackSpeed: 1 }
  try {
    gui.removeFolder(animationsFolder)
  } catch { }
  animationsFolder = gui.addFolder('Animations')
  animationsFolder.add(options, 'playbackSpeed', 0, 2)
    .onChange(v => {
      if (!viewer.mixer()) {
        options.playbackSpeed = 1
        return
      }
      viewer.mixer().timeScale = v
    })
  animations.forEach(({ name }, idx) => {
    options[name] = false
    if (idx === 0) {
      viewer.gltfAnimate(animations[0].name)
      options[name] = true
    }
    animationsFolder.add(options, name).name(`${idx + 1}. ${name}`)
      .onChange(v => {
        viewer.gltfAnimate(name, !v)
      })
  })
}

const form = document.querySelector('form')
const [fileInput, urlInput] = form
const canvas = document.createElement('canvas')

const viewer = new Viewer({ renderer: { canvas } })
document.body.appendChild(canvas)

const loadGLTF = (...p) => {
  setLoading(true)
  viewer.loadGLTF(...p).then(({ animations }) => {
    addAnimationsGUI(animations)
    form.hidden = true
  }, (e) => {
    console.error('Load glTF error:', e)
    form.hidden = false
  }).finally(() => {
    setLoading(false)
  })
}

onUploadGLTF(loadGLTF, console.error)
onDragDropGLTF(loadGLTF, console.error)

// =================== loading ===================
const setLoading = (function createIframeLoading() {
  const iframeT = document.createElement('iframe')
  iframeT.src = './?model=./loading/scene.gltf&autoRotateSpeed=30&bgColor=e0dfdf,0.85&z=0.35'
  iframeT.className = 'loading'
  iframeT.hidden = true
  document.body.appendChild(iframeT)
  return function setLoading(flag) {
    iframeT.hidden = !flag
  }
})()

  // ================== gltf input ===================
  ; (function onUrlInput() {
    const urlDemo = document.querySelector('.url-recommend')
    const inputEvent = new Event('input', { bubbles: true })
    urlDemo.addEventListener('click', ({ target }) => {
      if (target.tagName === 'LI') {
        urlInput.value = target.innerText
        urlInput.dispatchEvent(inputEvent)
        urlInput.scrollBy({ left: 999 })
      }
    })
    urlInput.addEventListener('input', ({ target }) => {
      fileInput.setAttribute('type', target.value ? 'submit' : 'button')
      const [label] = fileInput.children
      label.setAttribute('for', target.value ? 'urlInput' : 'fileInput')
      label.innerText = target.value ? 'Submit' : 'Upload'
    })
    let isFocus, isPointerover
    urlInput.addEventListener('focus', () => {
      urlDemo.hidden = false
      isFocus = true
      isPointerover = true
    })
    urlInput.addEventListener('blur', () => {
      if (!isPointerover) {
        urlDemo.hidden = true
      }
      isFocus = false
    })
    urlDemo.addEventListener('pointermove', () => {
      isPointerover = true
    })
    urlDemo.addEventListener('pointerleave', (evt) => {
      if (evt.pointerType !== 'mouse') return
      if (!isFocus) {
        urlDemo.hidden = true
      }
      isPointerover = false
    })
  })()

function onUploadGLTF(onLoad, onError) {
  fileInput.addEventListener('change', ({ target }) => {
    const { files } = target
    for (const file of files) {
      if (file.name.match(/\.gl(b|tf)$/)) {
        onLoad?.(file.name, { [file.name]: file })
        return
      }
    }
    onError?.('Not gltf')
  })
  form.addEventListener('submit', (e) => {
    const url = urlInput.value
    onLoad?.(url)
  })
}

function onDragDropGLTF(onLoad, onError) {
  const dropArea = document.body
  dropArea.addEventListener('dragenter', ondragenter)
  function ondragenter(evt) {
    dropArea.classList.add('dragging-hover')
    if (evt.target !== dropArea) return
    const ondragover = (evt) => evt.preventDefault()
    const onEnd = (evt) => {
      evt.preventDefault()
      if (evt.target === dropArea) {
        dropArea.classList.remove('dragging-hover')
        cleanup()
      }
    }
    dropArea.addEventListener('dragover', ondragover)
      ;['dragleave', 'drop', 'click'].forEach(e => {
        dropArea.addEventListener(e, onEnd)
      })
    function cleanup() {
      dropArea.removeEventListener('dragover', ondragover)
        ;['dragleave', 'drop', 'click'].forEach(e => {
          dropArea.removeEventListener(e, onEnd)
        })
    }
    return cleanup
  }
  dropArea.addEventListener('drop', async ({ dataTransfer }) => {
    const { items } = dataTransfer || {} // 获取文件列表
    const files = await Promise.all(await parseDataTransferItems(items))
    const blobs = {}
    let gltfFile
    files.forEach(({ file, fullPath }) => {
      blobs[fullPath] = file
      if (fullPath.match(/\.gl(b|tf)$/)) {
        gltfFile = fullPath
      }
    })
    if (gltfFile) {
      onLoad?.(gltfFile, blobs)
    } else {
      onError?.('Not gltf')
    }
  }, false)
}
