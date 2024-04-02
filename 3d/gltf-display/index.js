import { Viewer } from './Viewer.js'

main()

function main() {
  const { model, enableCtrl, backgroundColor, backgroundOpacity, autoRotateSpeed, lightColor, lightIntensity, z, debug, wireframe } = getSearchParams()

  if (!model) return

  const canvas = document.createElement('canvas')
  const viewer = new Viewer({ renderer: { canvas } })
  document.body.appendChild(canvas)

  backgroundColor && viewer.setBgColor(backgroundColor, backgroundOpacity)
  viewer.enableCtrl(false)
  enableCtrl && viewer.enableCtrl(enableCtrl)
  autoRotateSpeed && viewer.autoRotate(autoRotateSpeed)
  lightColor || lightIntensity != null && viewer.setLight({ color: lightColor, intensity: lightIntensity })

  const loadGLTF = (...p) => {
    viewer.unloadGLTF()
    viewer.loadGLTF(...p).then(() => {
      viewer.gltfAlignCenter(z)
      debug && viewer.gltfBoxHelper()
      wireframe && viewer.gltfWireFrame(wireframe)
    })
  }

  loadGLTF(model)
}

// =================== searchParams input ===================
function getSearchParams() {
  const { href } = location
  const { searchParams } = new URL(href)
  const searchP = Object.fromEntries(searchParams.entries())
    // inputBlocked: 只可查看model，不可input gltf
    // enableCtrl: controls可交互
    // debug: 可查看gltf box
    // wireframe: 可查看gltf wireframe
    ;['enableCtrl', 'debug', 'wireframe'].forEach((e) => {
      if (searchP[e] != null) {
        searchP[e] = true
      }
    })

  searchP.autoRotateSpeed = str2Num(searchP.autoRotateSpeed, [0])
  searchP.z = str2Num(searchP.z, [1e-4])

  const [backgroundColorStr, backgroundOpacityStr] = searchP.bgColor?.split(/[,，]/) || []
  const [backgroundColor, backgroundOpacity] = [str2Color(backgroundColorStr), str2Num(backgroundOpacityStr, [0, 1])]

  const [lightColorStr, lightIntensityStr] = searchP.light?.split(/[,，]/) || []
  const [lightColor, lightIntensity] = [str2Color(lightColorStr), str2Num(lightIntensityStr, [0], Boolean)]

  return { ...searchP, backgroundColor, backgroundOpacity, lightColor, lightIntensity }
}

// =================== common utils ===================
/**
 * 'fff' / 'ffffff' -> 0xffffff
 * @param {string} str 长度 3 or 6 的hex颜色字符串
 * @returns color 16进制hex色彩值
 */
function str2Color(str) {
  if (str?.length === 3) {
    str = [...str].map(e => e.repeat(2)).join('')
  }
  let color
  if (str?.length === 6) {
    color = parseInt(str, 16)
    if (Number.isNaN(color)) {
      color = undefined
    }
  }
  return color
}

/**
 * 字符串转数字: 非法字符串返回 undefined
 * @param {string} str 
 * @param {[min: number, max: number]} minmax 
 * @param {(str: string, num: string) => boolean} condition 
 * @returns 
 */
function str2Num(str, [min, max] = [], condition) {
  let num = +str
  const z = !Number.isNaN(num) &&
    num <= (max ?? num) &&
    num >= (min ?? num) &&
    !condition || condition?.(str, num)
  if (z)
    return num
}