
import { Viewer } from './Viewer.js'
import { parseDataTransferItems } from './readFiles.js'
// import { GUI } from 'three/examples/jsm/libs/lil-gui.module.min.js'

const gui = new dat.GUI()

const sceneOptions = { bgColor: '#ffffff', bgOpacity: 1, enableCtrl: true, rotateSpeed: 0 }
{
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

const lightOptions = { color: '#ffffff', intensity: 1 }
{
  const lightFolder = gui.addFolder('Light')
  lightFolder.addColor(lightOptions, 'color')
    .onChange((color) => viewer.setLight({ color }))
  lightFolder.add(lightOptions, 'intensity', 0, 8)
    .onChange((intensity) => viewer.setLight({ intensity }))
}

const modelOptions = { wireFrame: false, boxHelper: false, zoom: 2.0, alpha: 5.0 }
{
  const modelFolder = gui.addFolder('Model')
  modelFolder.add(modelOptions, 'wireFrame')
    .onChange((v) => viewer.gltfWireFrame(v))
  modelFolder.add(modelOptions, 'boxHelper')
    .onChange((v) => {
      v ? viewer.gltfBoxHelper() : viewer.gltfBoxHelper().dispose()
    })
  modelFolder.add(modelOptions, 'zoom', 0.1, 15)
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

const canvas = document.createElement('canvas')
const form = document.querySelector('form')
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
function onUploadGLTF(onLoad, onError) {
  const fileInput = form.querySelector('input[type=file]')
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
    const url = e.target[1].value
    try {
      new URL(url)
      onLoad?.(url)
    } catch {
      onError?.('Invalid URL')
    }
  })
}

function onDragDropGLTF(onLoad, onError) {
  const dropArea = document.body
  dropArea.addEventListener('dragenter', () => {
    document.body.setAttribute('data-content-hover', '拖拽glTF文件放置此处（支持.gltf/.glb）')
    dropArea.classList.add('hover')
  })
  dropArea.addEventListener('dragover', (evt) => evt.preventDefault())
    ;['dragleave', 'drop', 'click'].forEach(e => {
      dropArea.addEventListener(e, (evt) => {
        evt.preventDefault()
        if (evt.target === dropArea) {
          dropArea.classList.remove('hover')
        }
      })
    })
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
