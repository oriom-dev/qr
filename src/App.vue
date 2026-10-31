<script setup>
import { computed, ref, watch } from 'vue'
import QRCode from 'qrcode'
import siteQr from './site-qr.svg'
import { readability } from './qr-headroom.js'
import { createQrWithAnalysis, downloadSvg, downloadPng } from './qr.js'

const type = ref('url')
const url = ref('')
const text = ref('')
const ssid = ref('')
const password = ref('')
const security = ref('WPA')
const hidden = ref(false)
const rounded = ref(false)
const transparent = ref(false)
const imageEnabled = ref(false)
const imageSource = ref('favicon')
const uploadedImage = ref('')
const favicon = ref('')
const faviconMessage = ref('')
const imageSize = ref(0.2)
const imageX = ref(0)
const imageY = ref(0)
const version = ref('')
const maskPattern = ref('')
const margin = ref(4)
const readabilityLabels = ['読めない', 'ぎりぎり', '環境によっては大変', '簡単']
const qr = ref(null)
const headroom = ref(null)
const error = ref('')
const fileError = ref('')
const decodedImage = ref(null)
const imageError = ref('')

const escapeWifi = value => value.replace(/[\\;,:\"]/g, '\\$&')
const content = computed(() => {
  if (type.value === 'url') return url.value.trim()
  if (type.value === 'text') return text.value
  if (!ssid.value) return ''
  return `WIFI:T:${security.value};S:${escapeWifi(ssid.value)};${security.value === 'nopass' ? '' : `P:${escapeWifi(password.value)};`}H:${hidden.value ? 'true' : 'false'};;`
})
const minimumVersion = computed(() => {
  if (!content.value) return null
  try {
    return QRCode.create(content.value, { errorCorrectionLevel: 'H' }).version
  } catch {
    return null
  }
})
const readabilityLevel = computed(() => headroom.value ? readability(headroom.value) : 0)
watch(minimumVersion, minimum => {
  if (minimum && version.value !== '' && version.value < minimum) version.value = ''
}, { flush: 'sync' })

const faviconUrl = computed(() => {
  if (type.value !== 'url' || !imageEnabled.value || imageSource.value !== 'favicon') return ''
  try {
    const parsed = new URL(url.value.trim())
    return ['http:', 'https:'].includes(parsed.protocol) ? parsed.hostname : ''
  } catch {
    return ''
  }
})
const image = computed(() => imageEnabled.value ? (imageSource.value === 'favicon' && type.value === 'url' ? favicon.value : imageSource.value === 'upload' ? uploadedImage.value : '') : '')

watch(type, value => {
  if (value !== 'url' && imageSource.value === 'favicon') imageSource.value = 'upload'
})

watch(faviconUrl, (origin, _, onCleanup) => {
  favicon.value = ''
  faviconMessage.value = ''
  if (!origin) return
  const controller = new AbortController()
  const timer = setTimeout(async () => {
    faviconMessage.value = 'アイコンを取得しています…'
    try {
      const response = await fetch(`https://images.weserv.nl/?url=${encodeURIComponent(`icons.duckduckgo.com/ip3/${origin}.ico`)}&output=png`, { mode: 'cors', signal: controller.signal })
      if (!response.ok) throw new Error('Fetch failed')
      const blob = await response.blob()
      if (!/^image\/(png|jpeg|webp|gif)$/i.test(blob.type)) throw new Error('Unsupported image')
      const reader = new FileReader()
      reader.onload = () => {
        if (!controller.signal.aborted) {
          favicon.value = reader.result
          faviconMessage.value = 'サイトのアイコンを取得しました。'
        }
      }
      reader.onerror = () => { if (!controller.signal.aborted) faviconMessage.value = '取得できませんでした。画像をアップロードしてください。' }
      reader.readAsDataURL(blob)
    } catch {
      if (!controller.signal.aborted) faviconMessage.value = '取得できませんでした。画像をアップロードしてください。'
    }
  }, 400)
  onCleanup(() => { clearTimeout(timer); controller.abort() })
}, { immediate: true })

let fileVersion = 0
function onUpload(event) {
  const version = ++fileVersion
  const file = event.target.files?.[0]
  uploadedImage.value = ''
  fileError.value = ''
  if (!file) return
  if (!/^image\/(png|jpeg|webp|gif|svg\+xml)$/i.test(file.type)) {
    fileError.value = 'PNG、JPEG、WebP、GIF、SVG の画像を選択してください。'
    return
  }
  const reader = new FileReader()
  reader.onload = () => { if (version === fileVersion) uploadedImage.value = reader.result }
  reader.onerror = () => { if (version === fileVersion) fileError.value = '画像を読み込めませんでした。' }
  reader.readAsDataURL(file)
}

watch(image, (src, _, onCleanup) => {
  decodedImage.value = null
  imageError.value = ''
  if (!src) return
  const img = new Image()
  let current = true
  onCleanup(() => { current = false })
  img.onload = () => {
    if (!current) return
    if (!img.naturalWidth || !img.naturalHeight) {
      imageError.value = '画像のサイズを取得できませんでした。'
      return
    }
    decodedImage.value = { src, aspect: img.naturalWidth / img.naturalHeight }
  }
  img.onerror = () => { if (current) imageError.value = '画像を読み込めませんでした。' }
  img.src = src
}, { immediate: true })

watch([content, rounded, transparent, decodedImage, imageSize, imageX, imageY, version, maskPattern, margin], async (_, __, onCleanup) => {
  let current = true
  onCleanup(() => { current = false })
  qr.value = null
  headroom.value = null
  error.value = ''
  if (!content.value) return
  try {
    const result = createQrWithAnalysis(content.value, {
      rounded: rounded.value,
      transparent: transparent.value,
      image: decodedImage.value?.src,
      imageAspect: decodedImage.value?.aspect,
      imageSize: Number(imageSize.value),
      imageX: Number(imageX.value),
      imageY: Number(imageY.value),
      version: version.value === '' ? undefined : version.value,
      maskPattern: maskPattern.value === '' ? undefined : maskPattern.value,
      margin: margin.value,
    })
    if (current) {
      qr.value = result.svg
      headroom.value = result.headroom
    }
  } catch {
    if (current) error.value = 'QRコードを作成できませんでした。入力内容や文字数を確認してください。'
  }
}, { immediate: true })

async function download(format) {
  if (!qr.value) return
  try {
    await (format === 'svg' ? downloadSvg(qr.value) : downloadPng(qr.value))
  } catch {
    error.value = 'ダウンロードできませんでした。画像を変更してもう一度お試しください。'
  }
}
</script>

<template>
  <div class="page-shell">
    <header class="site-header">
      <a class="brand" href="#top" aria-label="QR GENERATOR ホーム"><span class="brand-mark"><img :src="siteQr" alt=""></span> QR GENERATOR<span class="brand-dot">.</span></a>
    </header>

    <main id="top" class="container">
      <h1 class="visually-hidden">QR GENERATOR</h1>

      <div class="workspace">
        <section class="editor panel" aria-labelledby="editor-title">
          <div class="panel-heading"><div><p class="section-kicker">01 / CUSTOMIZE</p><h2 id="editor-title">QRをカスタマイズ</h2></div></div>
          <fieldset class="field-group">
            <legend><span class="step">1</span> 何をシェアする？</legend>
            <div class="segmented type-picker">
              <label v-for="option in [{ value: 'url', label: '↗  URL' }, { value: 'text', label: '✎  テキスト' }, { value: 'wifi', label: '⌁  Wi-Fi' }]" :key="option.value" :class="{ selected: type === option.value }"><input v-model="type" type="radio" name="type" :value="option.value"><span>{{ option.label }}</span></label>
            </div>
            <div v-if="type === 'url'" class="input-block"><label for="url">URL</label><input id="url" v-model="url" type="url" placeholder="https://example.com" autocomplete="url"><p class="hint">https:// から入力してください。</p></div>
            <div v-else-if="type === 'text'" class="input-block"><label for="text">テキスト</label><textarea id="text" v-model="text" rows="4" placeholder="ここにテキストを入力"></textarea></div>
            <div v-else class="wifi-fields">
              <div class="input-block"><label for="ssid">ネットワーク名（SSID）</label><input id="ssid" v-model="ssid" type="text" autocomplete="off" placeholder="ネットワーク名"></div>
              <div class="input-block"><label for="security">セキュリティ</label><select id="security" v-model="security"><option value="WPA">WPA / WPA2 / WPA3</option><option value="WEP">WEP</option><option value="nopass">なし</option></select></div>
              <div v-if="security !== 'nopass'" class="input-block"><label for="password">パスワード</label><input id="password" v-model="password" type="password" autocomplete="off" placeholder="パスワード"></div>
              <label class="check-label"><input v-model="hidden" type="checkbox"> 非公開ネットワーク</label>
              <p class="hint">Wi-FiのパスワードはQRコードを読み取る人に共有されます。</p>
            </div>
          </fieldset>

          <fieldset class="field-group">
            <legend><span class="step">2</span> 見た目をえらぶ</legend>
            <span class="field-label">ドットの形</span>
            <div class="segmented shape-picker">
              <label :class="{ selected: !rounded }"><input v-model="rounded" type="radio" name="shape" :value="false"><span><span aria-hidden="true">▦</span> スクエア</span></label>
              <label :class="{ selected: rounded }"><input v-model="rounded" type="radio" name="shape" :value="true"><span><span aria-hidden="true">⠿</span> まる</span></label>
            </div>
            <label class="toggle-row"><span><strong>背景を透明にする</strong></span><input v-model="transparent" type="checkbox" role="switch"><span class="switch" aria-hidden="true"></span></label>
          </fieldset>

          <fieldset class="field-group image-group">
            <legend><span class="step">3</span> 画像をプラス</legend>
            <label class="toggle-row"><span><strong>中央に画像を入れる</strong></span><input v-model="imageEnabled" type="checkbox" role="switch"><span class="switch" aria-hidden="true"></span></label>
            <div v-if="imageEnabled" class="image-options">
              <div v-if="type === 'url'" class="segmented"><label :class="{ selected: imageSource === 'favicon' }"><input v-model="imageSource" type="radio" name="image-source" value="favicon"><span>サイトのアイコン</span></label><label :class="{ selected: imageSource === 'upload' }"><input v-model="imageSource" type="radio" name="image-source" value="upload"><span>画像をアップロード</span></label></div>
              <template v-if="imageSource === 'favicon' && type === 'url'"><p class="privacy-note">アイコン取得のため、URLのホスト名を weserv.nl と DuckDuckGo に送信します。取得できない場合は画像をアップロードしてください。</p><p v-if="faviconMessage" class="hint" role="status">{{ faviconMessage }}</p><p v-else-if="!faviconUrl" class="hint">http:// または https:// で始まるURLを入力してください。</p></template>
              <div v-else class="input-block"><label for="image-file">画像ファイル</label><input id="image-file" type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml" @change="onUpload"><p class="hint">PNG、JPEG、WebP、GIF、SVG に対応</p><p v-if="fileError" class="error" role="alert">{{ fileError }}</p></div>
              <p v-if="imageError" class="error" role="alert">{{ imageError }}</p>
              <div class="slider-list">
                <label for="image-size"><span>画像のサイズ <output>{{ Math.round(imageSize * 100) }}%</output></span><input id="image-size" v-model.number="imageSize" type="range" min="0.05" max="0.3" step="0.01"></label>
                <label for="image-x"><span>左右の位置 <output>{{ imageX }} モジュール</output></span><input id="image-x" v-model.number="imageX" type="range" min="-10" max="10" step="1"></label>
                <label for="image-y"><span>上下の位置 <output>{{ imageY }} モジュール</output></span><input id="image-y" v-model.number="imageY" type="range" min="-10" max="10" step="1"></label>
              </div>
              <p class="hint">画像の大きさや位置によっては読み取れない場合があります。</p>
            </div>
          </fieldset>
          <details class="advanced field-group">
            <summary>詳細設定</summary>
            <div class="input-block"><label for="version">QRコードのサイズ</label><select id="version" v-model="version" :disabled="!minimumVersion"><option value="">自動</option><option v-for="n in 40" :key="n" :value="n" :disabled="n < minimumVersion">{{ n }}（{{ 17 + n * 4 }} × {{ 17 + n * 4 }}）</option></select></div>
            <div class="input-block"><label for="mask">マスク</label><select id="mask" v-model="maskPattern"><option value="">自動</option><option v-for="n in 8" :key="n" :value="n - 1">{{ n - 1 }}</option></select></div>
            <label class="check-label"><input v-model="margin" type="checkbox" :true-value="0" :false-value="4"> 余白をなくす</label>
            <p v-if="margin === 0" class="hint">配置先で周囲に4マス分の明るい余白が必要です。</p>
          </details>
        </section>

        <aside class="preview panel" aria-labelledby="preview-title">
          <div class="panel-heading"><div><p class="section-kicker">02 / PREVIEW</p><h2 id="preview-title">プレビュー</h2></div><span class="live-badge"><span></span> LIVE</span></div>
          <div class="preview-stage" :class="{ checkerboard: transparent }">
            <img v-if="qr" :src="typeof qr === 'string' ? 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(qr) : ''" alt="生成されたQRコード" class="qr-preview">
            <div v-else class="preview-placeholder"><span aria-hidden="true">▦</span><p>ここにQRコードが<br>表示されます</p></div>
          </div>
          <p v-if="error" class="error" role="alert">{{ error }}</p>
          <section v-if="headroom" class="headroom" aria-labelledby="headroom-title" aria-live="polite">
            <div class="headroom-heading"><h3 id="headroom-title">読み取りやすさ</h3><span class="headroom-number">{{ headroom.remaining }} / {{ headroom.capacity }}</span></div>
            <p class="readability-current">{{ readabilityLabels[readabilityLevel] }}</p>
            <div class="readability-track" role="meter" aria-label="読み取りやすさの目安" aria-valuemin="0" aria-valuemax="3" :aria-valuenow="readabilityLevel" :aria-valuetext="readabilityLabels[readabilityLevel]"><span class="readability-marker" :style="{ left: `${readabilityLevel * 100 / 3}%` }"></span></div>
            <div class="readability-labels" aria-hidden="true"><span v-for="label in readabilityLabels" :key="label">{{ label }}</span></div>
            <p class="hint">画像の影響を大きめに見積もった目安です。実際の読み取りを保証するものではありません。</p>
            <p v-if="headroom.reserved" class="error">画像が読み取りに必要な特殊パターンと重なっています。読み取れない可能性があります。</p>
          </section>
          
          <div class="download-area"><div class="download-buttons"><button type="button" :disabled="!qr" @click="download('png')">↓ PNG <span>画像</span></button><button type="button" class="secondary" :disabled="!qr" @click="download('svg')">↓ SVG <span>ベクター</span></button></div><p class="hint">ご利用前に、お手持ちの端末で読み取れるか確認してください。</p></div>
        </aside>
      </div>
    </main>
    <footer><span>QR GENERATOR<span class="brand-dot">.</span></span><a href="https://github.com/oriom-dev" target="_blank" rel="noopener noreferrer">By oriom</a></footer>
  </div>
</template>
