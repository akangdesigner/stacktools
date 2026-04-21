export interface ClientProfile {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;

  // Headings
  h2Color: string;
  h2FontSize: string;
  h2LineHeight: string;
  h2Bold: boolean;
  h3Color: string;
  h3FontSize: string;
  h3LineHeight: string;
  h3Bold: boolean;

  // Paragraph / body
  paragraphFontSize: string;
  paragraphColor: string;
  paragraphLineHeight: string;

  // Links
  linkColor: string;
  linkTextDecoration: string;
  linkFontWeight: string;    // "400" | "bold"
  stripLinkBold: boolean;    // remove <strong>/<b> inside <a>

  // CTA buttons
  buttonBgColor: string;
  buttonTextColor: string;
  buttonBorderRadius: string;
  buttonPadding: string;
  stripButtonStyle: boolean;  // strip button styling, render as plain link

  // List items
  listItemColor: string;
  listItemFontSize: string;
  deduplicateLi: boolean;    // remove duplicate <li> items

  // Images
  imageMaxWidth: string;
  imageBorderRadius: string;

  // FAQ mode — applies to H3s under FAQ H2
  faqEnabled: boolean;       // activate FAQ section detection
  faqH3Color: string;        // FAQ H3 text color; "" = inherit h3Color
  faqH3FontSize: string;     // FAQ H3 font-size; "" = inherit h3FontSize
  faqH3Bold: boolean;        // FAQ H3 bold
  faqLabelEnabled: boolean;  // prefix FAQ H3 with Q1: Q2: ...
  faqLabelColor: string;     // Q label color; "" = inherit faqH3Color
  faqLabelFontSize: string;  // Q label font-size; "" = inherit faqH3FontSize

  // Extra transformations
  emColor: string;           // convert <em> to colored span; "" = keep as-is
  emBold: boolean;           // convert <em> to bold black (takes priority over emColor)
  generateToc: boolean;      // prepend auto-generated table of contents
  tocTitle: string;          // heading text for the TOC box
  tocBgColor: string;        // TOC box background color; "" = transparent
  tocBgOpacity: number;      // TOC background opacity (0-100)
  blogBaseUrl: string;       // e.g. https://www.tantanwow.com/blog/posts/
  specialNotes: string;      // 上架注意事項，顯示於結果頁提醒
}

export interface ImageReplacement {
  original: string;
  replacement: string;
}

export interface WizardState {
  currentStep: 1 | 2 | 3 | 4 | 5;
  rawHtml: string;
  imageReplacements: ImageReplacement[];
  selectedClientId: string | null;
  articleSlug: string;
  cleanedHtml: string | null;
  isLoading: boolean;
  error: string | null;
}

export interface CleanHtmlRequest {
  html: string;
  client: ClientProfile;
  articleUrl?: string;
}

export interface CleanHtmlResponse {
  cleanedHtml: string;
}
