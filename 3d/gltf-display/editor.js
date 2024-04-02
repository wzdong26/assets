
import { Viewer } from './Viewer.js'
import { parseDataTransferItems } from './readFiles.js'

const gui = new dat.GUI()

const sceneOptions = { bgColor: '#ffffff', bgOpacity: 1, controlled: true, rotateSpeed: 0 }
const sceneFolder = gui.addFolder('Scene')
sceneFolder.addColor(sceneOptions, 'bgColor')
  .onChange((color) => viewer.setBgColor(color, sceneOptions.bgOpacity))
sceneFolder.add(sceneOptions, 'bgOpacity', 0, 1)
  .onChange((opacity) => viewer.setBgColor(sceneOptions.bgColor, opacity))
sceneFolder.add(sceneOptions, 'controlled')
  .onChange((e) => viewer.enableCtrl(e))
sceneFolder.add(sceneOptions, 'rotateSpeed', -100, 100)
  .onChange((e) => viewer.autoRotate(e))

const lightOptions = { color: '#ffffff', intensity: 1 }
const lightFolder = gui.addFolder('Light')
lightFolder.addColor(lightOptions, 'color')
  .onChange((color) => viewer.setLight({ color }))
lightFolder.add(lightOptions, 'intensity', 0, 8)
  .onChange((intensity) => viewer.setLight({ intensity }))

const modelOptions = { wireFrame: false, boxHelper: false, zoom: 2.0 }
const modelFolder = gui.addFolder('Model')
modelFolder.add(modelOptions, 'wireFrame')
  .onChange((v) => viewer.gltfWireFrame(v))
modelFolder.add(modelOptions, 'boxHelper')
  .onChange(() => viewer.gltfBoxHelper())
modelFolder.add(modelOptions, 'zoom', 0.1, 15)
  .onChange((v) => viewer.gltfAlignCenter(v))

const canvas = document.createElement('canvas')
const viewer = new Viewer({ renderer: { canvas } })
document.body.appendChild(canvas)

const form = document.querySelector('form')
form.addEventListener('submit', (e) => {
  const url = e.target[1].value
  console.log(url)
  loadGLTF(url)
})

const loadGLTF = (...p) => {
  setLoading(true)
  viewer.unloadGLTF()
  viewer.loadGLTF(...p).then(() => {
    const { zoom, boxHelper, wireFrame } = modelOptions
    viewer.gltfAlignCenter(zoom)
    boxHelper && viewer.gltfBoxHelper()
    wireFrame && viewer.gltfWireFrame(wireFrame)
    form.hidden = true
  }, () => {
    console.error('load glTF error')
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
  iframeT.src = './?model=./loading/scene.gltf&autoRotateSpeed=30&bgColor=e0dfdf,0.85&z=0.35&inputBlocked&ctrlBlocked'
  iframeT.className = 'loading'
  iframeT.hidden = true
  document.body.appendChild(iframeT)
  return function setLoading(flag) {
    iframeT.hidden = !flag
  }
})()

// ================== gltf input ===================
function onUploadGLTF(onLoad, onError) {
  const fileInput = document.querySelector('input[type=file]')
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
