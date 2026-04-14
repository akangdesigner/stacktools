export function getConsoleSnippet(): string {
  return `(async function() {
    console.log("%c文章上架工具：擷取文章 HTML...", "color: #ff5c00; font-weight: bold;");

    const orange = "#E67E22";
    const black = "#000000";

    var source = document.querySelector('.elementor-widget-theme-post-content') ||
                 document.querySelector('article') ||
                 document.body;

    var nodes = source.querySelectorAll('h1, h2, h3, p, img, ul, ol, blockquote, a.elementor-button-link, .elementor-button');
    var resultHtml = "";
    var imageUrls = [];

    async function downloadImage(url, filename) {
        try {
            const decodedFilename = decodeURIComponent(filename.split(/\\#|\\?/)[0]);
            const response = await fetch(url);
            const blob = await response.blob();
            const link = document.createElement("a");
            link.href = URL.createObjectURL(blob);
            link.download = decodedFilename;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            setTimeout(() => URL.revokeObjectURL(link.href), 100);
        } catch (error) { console.error("下載失敗:", url); }
    }

    nodes.forEach(function(node) {
        var tagName = node.tagName.toLowerCase();

        if (tagName.startsWith('h')) {
            var cleanTitle = node.innerText.trim();
            var color = (tagName === 'h3') ? orange : black;
            var fontSize = (tagName === 'h2') ? "32px" : "24px";
            resultHtml += \`<\${tagName} style="color:\${color}; font-size:\${fontSize}; font-weight:700; margin-top:30px; margin-bottom:15px; display:block;">\${cleanTitle}</\${tagName}>\\n\`;
        }
        else if (tagName === 'a' || node.classList.contains('elementor-button')) {
            var href = node.getAttribute('href') || '#';
            var btnText = node.innerText.trim();
            if (btnText) {
                resultHtml += \`<div style="text-align: center; margin: 30px 0;"><a href="\${href}" target="_blank" style="background-color: #333333; color: #ffffff; padding: 12px 30px; text-decoration: none; border-radius: 4px; font-weight: bold; display: inline-block;">\${btnText}</a></div>\\n\`;
            }
        }
        else if (tagName === 'p' || tagName === 'ul' || tagName === 'ol') {
            var cleanInner = node.innerHTML.replace(/class=".*?"/g, '').replace(/style=".*?"/g, '');
            if (tagName === 'ul' || tagName === 'ol') {
                cleanInner = cleanInner.replace(/<li[^>]*>(.*?)<\\/li>/g, '<li style="margin-bottom:10px;"><span style="font-size:18px; color:#454f5e; line-height:1.8;">$1</span></li>');
            }
            var wrapper = (tagName === 'p') ? \`<span style="font-size:18px; color:#454f5e; line-height:1.8;">\${cleanInner}</span>\` : cleanInner;
            resultHtml += \`<\${tagName} style="margin-bottom:15px;">\${wrapper}</\${tagName}>\\n\`;
        }
        else if (tagName === 'img') {
            if (node.naturalWidth > 0 && node.naturalWidth < 50) return;
            if (node.width > 0 && node.width < 50) return;
            var altText = node.alt ? node.alt.trim() : "";
            var originalFilename = node.src.substring(node.src.lastIndexOf('/') + 1);
            imageUrls.push({ url: node.src, name: originalFilename });
            resultHtml += \`<img src="\${node.src}" alt="\${altText.replace(/"/g, '&quot;')}" style="max-width:100%; height:auto; display:block; margin: 10px auto;"><br>\\n\`;
        }
    });

    try {
        await navigator.clipboard.writeText(resultHtml);
    } catch(e) {
        var textArea = document.createElement("textarea");
        textArea.value = resultHtml;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
    }

    for (let i = 0; i < imageUrls.length; i++) {
        await downloadImage(imageUrls[i].url, imageUrls[i].name);
        await new Promise(r => setTimeout(r, 400));
    }
    console.log("%c✔ 完成！HTML 已複製到剪貼簿。", "color: #28a745; font-weight: bold;");
})();`;
}
