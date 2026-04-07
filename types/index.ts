export interface ClientProfile {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;

  // Headings
  h2Color: string;
  h2FontSize: string;
  h2LineHeight: string;
  h3Color: string;
  h3FontSize: string;
  h3LineHeight: string;

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

  // List items
  listItemColor: string;
  listItemFontSize: string;
  deduplicateLi: boolean;    // remove duplicate <li> items

  // Images
  imageMaxWidth: string;
  imageBorderRadius: string;

  // Extra transformations
  emColor: string;           // convert <em> to colored span; "" = keep as-is
  generateToc: boolean;      // prepend auto-generated table of contents
  tocTitle: string;          // heading text for the TOC box
}

export interface WizardState {
  currentStep: 1 | 2 | 3 | 4;
  rawHtml: string;
  selectedClientId: string | null;
  cleanedHtml: string | null;
  isLoading: boolean;
  error: string | null;
}

export interface CleanHtmlRequest {
  html: string;
  client: ClientProfile;
}

export interface CleanHtmlResponse {
  cleanedHtml: string;
}
