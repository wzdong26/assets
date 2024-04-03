
import { ViewerConfigurator } from './ViewerConfigurator.js'
import { parseDataTransferItems } from './readFiles.js'

const gui = new dat.GUI()

const configurator = new ViewerConfigurator(true)
const { viewer, conf } = configurator

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
  basicFolder.add({
    share() {
      if (!modelUrl) return
      let search = `model=${encodeURIComponent(modelUrl)}&`
      const { model, animations, bgColor, bgOpacity, lightColor, lightIntensity, ...newConf } = conf
      search += animations ? `animations=${encodeURIComponent(animations.join(','))}&` : ''
      search += `bgColor=${encodeURIComponent(bgColor) + ',' + encodeURIComponent(bgOpacity)}&`
      search += `light=${encodeURIComponent(lightColor) + ',' + encodeURIComponent(lightIntensity)}&`
      Object.entries(newConf).forEach(([k, v]) => {
        if (!v) return
        search += `${k}=${encodeURIComponent(v)}&`
      })
      window.open(new URL(`./?${search}`, location.href))
    }
  }, 'share')
}

{
  const sceneFolder = gui.addFolder('Scene')
  sceneFolder.addColor(conf, 'bgColor')
  sceneFolder.add(conf, 'bgOpacity', 0, 1)
  sceneFolder.add(conf, 'enableCtrl')
  sceneFolder.add(conf, 'rotate', -100, 100)
}

{
  const lightFolder = gui.addFolder('Light')
  lightFolder.addColor(conf, 'lightColor')
  lightFolder.add(conf, 'lightIntensity', 0, 8)
}

{
  const modelFolder = gui.addFolder('Model')
  modelFolder.add(conf, 'wireFrame')
  modelFolder.add(conf, 'boxHelper')
  modelFolder.add(conf, 'zoom', 0.1, 10)
  modelFolder.add(conf, 'alpha', 1, 7)
}

let animationsFolder
function addAnimationsGUI(animations) {
  if (!animations?.length) return
  try {
    gui.removeFolder(animationsFolder)
  } catch { }
  animationsFolder = gui.addFolder('Animations')
  animationsFolder.add(conf, 'animationSpeed', 0, 2)
    ; animations.forEach(({ name }, idx) => {
      const opts = { [name]: false }
      if (idx === 0) {
        opts[name] = true
        conf.animations = [name]
      }
      animationsFolder.add(opts, name).name(`${idx + 1}. ${name}`)
        .onChange(v => {
          if (v) {
            conf.animations = [...conf.animations, name]
          } else {
            const idx = conf.animations.indexOf(name)
            if (idx >= 0) {
              conf.animations.splice(idx, 1)
              conf.animations = [...conf.animations]
            }
          }
        })
    })
}

const form = document.querySelector('form')
const [fileInput, urlInput] = form

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
  iframeT.src = './?model=./loading/scene.gltf&rotate=30&bgColor=e0dfdf,0.85&zoom=0.35'
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
      label.setAttribute('for', target.value ? '' : 'fileInput')
      label.innerHTML = target.value ? '<output>Submit</output>' : 'Upload'
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

let modelUrl;
function onUploadGLTF(onLoad, onError) {
  const fileInputOrigin = document.getElementById('fileInput')
  fileInputOrigin.addEventListener('change', ({ target }) => {
    const { files } = target
    for (const file of files) {
      if (file.name.match(/\.gl(b|tf)$/)) {
        modelUrl = URL.createObjectURL(file)
        onLoad?.(file.name, { [file.name]: file })
        return
      }
    }
    onError?.('Not gltf')
  })
  form.addEventListener('submit', (e) => {
    modelUrl = urlInput.value
    onLoad?.(modelUrl)
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
