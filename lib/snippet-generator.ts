export function getConsoleSnippet(): string {
  return `(async function() {
    console.log("%c文章上架工具：擷取文章 HTML...", "color: #ff5c00; font-weight: bold;");

    const orange = "#E67E22";
    const black = "#000000";

    var source = document.querySelector('.elementor-widget-theme-post-content') ||
                 document.querySelector('article') ||
                 document.body;

    var nodes = source.querySelectorAll('h1, h2, h3, p, img, ul, ol, table, blockquote, a.elementor-button-link, .elementor-button');
    var resultHtml = "";
    var imageUrls = [];

    // 遞迴組裝 ul/ol，把「本層文字」跟「巢狀清單」分開處理，
    // 避免用 regex 配對 <li>...</li> 時被巢狀 li 的結尾提前截斷（結構會整個歪掉）
    function flattenListItem(li) {
        var nestedList = li.querySelector(':scope > ul, :scope > ol');
        var liCopy = li.cloneNode(true);
        var nestedInCopy = liCopy.querySelector(':scope > ul, :scope > ol');
        if (nestedInCopy) nestedInCopy.remove();
        var flat = liCopy.innerHTML
            .replace(/<\\/?p[^>]*>/g, '')
            .replace(/&nbsp;/g, '')
            .replace(/\\s*(class|style|data-[\\w-]+)="[^"]*"/g, '')
            .trim();
        var nestedHtml = nestedList ? buildListHtml(nestedList, false) : '';
        return '<li style="margin-bottom:10px;"><span style="font-size:18px; color:#454f5e; line-height:1.8;">' + flat + '</span>' + nestedHtml + '</li>';
    }

    function buildListHtml(listEl, isTopLevel) {
        var tag = listEl.tagName.toLowerCase();
        var itemsHtml = '';
        Array.prototype.forEach.call(listEl.children, function(li) {
            if (li.tagName.toLowerCase() !== 'li') return;
            itemsHtml += flattenListItem(li);
        });
        var styleAttr = isTopLevel ? ' style="margin-bottom:15px;"' : '';
        return '<' + tag + styleAttr + '>' + itemsHtml + '</' + tag + '>';
    }

    async function downloadImage(url, filename) {
        try {
            const decodedFilename = decodeURIComponent(filename.split(/\\#|\\?/)[0]);
            const response = await fetch(url);
            const blob = await response.blob();

            // 一律轉成 JPEG，避免 WebP 等格式難以後製；透明背景自動填白底
            let outBlob = blob;
            let downloadName = decodedFilename;
            try {
                const bitmap = await createImageBitmap(blob);
                const canvas = document.createElement("canvas");
                canvas.width = bitmap.width;
                canvas.height = bitmap.height;
                const ctx = canvas.getContext("2d");
                ctx.fillStyle = "#ffffff";
                ctx.fillRect(0, 0, canvas.width, canvas.height);
                ctx.drawImage(bitmap, 0, 0);
                const jpegBlob = await new Promise(function(res) { canvas.toBlob(res, "image/jpeg", 0.92); });
                if (jpegBlob) {
                    outBlob = jpegBlob;
                    downloadName = decodedFilename.replace(/\\.[^.]+$/, "") + ".jpg";
                }
            } catch (convError) {
                console.warn("轉檔失敗，改下載原始檔:", url);
            }

            const link = document.createElement("a");
            link.href = URL.createObjectURL(outBlob);
            link.download = downloadName;
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
        else if (tagName === 'p' && node.closest('ul, ol')) {
            return; // 跳過 ul/ol 內的 <p>，避免重複輸出
        }
        else if ((tagName === 'ul' || tagName === 'ol') && node.parentElement && node.parentElement.closest('ul, ol')) {
            return; // 跳過巢狀清單本身，內容會在外層清單遞迴處理時一併帶出，避免重複輸出
        }
        else if (tagName === 'ul' || tagName === 'ol') {
            resultHtml += buildListHtml(node, true) + \`\\n\`;
        }
        else if (tagName === 'p') {
            var cleanInner = node.innerHTML.replace(/class=".*?"/g, '').replace(/style=".*?"/g, '');
            var wrapper = \`<span style="font-size:18px; color:#454f5e; line-height:1.8;">\${cleanInner}</span>\`;
            resultHtml += \`<p style="margin-bottom:15px;">\${wrapper}</p>\\n\`;
        }
        else if (tagName === 'table') {
            var cleanTable = node.outerHTML.replace(/\\s*class="[^"]*"/g, '').replace(/\\s*style="[^"]*"/g, '');
            resultHtml += cleanTable + \`\\n\`;
        }
        else if (tagName === 'img' && (node.closest('ul, ol') || node.closest('table'))) {
            return; // 跳過 ul/ol、table 內的 <img>，避免跟 table 整段擷取重複
        }
        else if (tagName === 'img') {
            if (node.naturalWidth > 0 && node.naturalWidth < 50) return;
            if (node.width > 0 && node.width < 50) return;
            var altText = node.alt ? node.alt.trim() : "";
            var originalFilename = node.src.substring(node.src.lastIndexOf('/') + 1).replace(/-\\d+[xX]\\d+(?=[^?#]*$)/, '');
            imageUrls.push({ url: node.src, name: originalFilename });
            if (!altText) {
                var rawName = node.src.substring(node.src.lastIndexOf('/') + 1).replace(/[?#].*$/, '').replace(/-\\d+[xX]\\d+(?=\\.[^.]+$)/, '').replace(/\\.[^.]+$/, '');
                try { altText = decodeURIComponent(rawName).replace(/[-_]+/g, ' ').trim(); } catch(e) { altText = rawName.replace(/[-_]+/g, ' ').trim(); }
            }
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
