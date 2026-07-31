export const OCR_RUNTIME_CONFIG = {
  runtimeId: 'tesseract-browser-pinned-v1',
  tesseractVersion: '7.0.0',
  coreVersion: '7.0.0',
  languageDataVersion: '4.0.0_best_int',
  language: 'eng+vie',
  workerPath: '/ocr/tesseract/worker.min.js',
  corePath: '/ocr/tesseract/tesseract-core-lstm.wasm.js',
  langPath: '/ocr/tessdata',
  cacheMethod: 'none',
  gzip: true,
  assetSha256: {
    worker: '576B7DF7E3393E137E51849357C9ADB53FE7AC1BB69BFA06CF3D61520F182C6D',
    coreJavascript: 'EEF5F8B2F8E20E150680B20ADAEC4A60BABAFEE3ADBE8A94583C81FEE46E8680',
    coreWasm: '66B17DF6E20C5329A17FFA9C202A47EAA3E32500B253D4C7F38E7F2BC01457C3',
    englishTrainedData: '45B4CB346724AC1774F1C36F42F182B887BCDB28EBE63E6FFF90AC41F3FCFF91',
    vietnameseTrainedData: '2284F610F262A1B19EC8DF9F196B9FF6CE38DDB4A66329E998941DF4B8961C8D',
  },
  workerParameters: {
    tessedit_pageseg_mode: 'SPARSE_TEXT (11); card labels/values use SINGLE_LINE or SINGLE_WORD',
    preserve_interword_spaces: '1',
    user_defined_dpi: '300',
    rotate_auto: 'false',
    character_whitelist: 'derived from the canonical metric value kind',
  },
  preprocessingPipeline: [
    'full_image_sparse_text',
    'dashboard_roi_detection',
    'normalized_roi_sparse_text',
    'normalized_roi_adaptive',
    'anchor_aligned_card_crop',
    'original_color',
    'fixed_threshold',
    'local_contrast',
    'adaptive_threshold',
    'high_resolution_glyph',
    'segmented_glyph',
  ],
} as const

export function pinnedBrowserWorkerOptions() {
  return {
    workerPath: OCR_RUNTIME_CONFIG.workerPath,
    corePath: OCR_RUNTIME_CONFIG.corePath,
    langPath: OCR_RUNTIME_CONFIG.langPath,
    cacheMethod: OCR_RUNTIME_CONFIG.cacheMethod,
    gzip: OCR_RUNTIME_CONFIG.gzip,
  }
}
