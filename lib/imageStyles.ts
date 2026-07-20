// AI小編 LIFF 系列（節慶/短影音/部落格改寫/時事）生圖風格清單。
// code 存進 ai_editor_clients.image_style；label 給表單下拉顯示；
// n8n 那邊的「圖片提示詞」節點靠 code 對照塞英文 style 描述，清單異動要同步改 n8n prompt。
export const IMAGE_STYLES: { code: string; label: string }[] = [
  { code: '', label: '不指定（AI 依內容判斷）' },
  { code: 'cinematic', label: '電影感' },
  { code: 'anime', label: '日式動漫風' },
  { code: 'retro', label: '復古底片風' },
  { code: 'watercolor', label: '手繪水彩風' },
  { code: 'claymation', label: '黏土微縮模型感' },
  { code: 'object-hero', label: '物件主體風' },
];
