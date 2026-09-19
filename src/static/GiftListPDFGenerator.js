/**
 * GiftRegistryPDF - 样式配置优化版
 * 仅优化了配置解析和样式管理，核心绘图和布局逻辑保持原样，确保 PDF 输出完全一致。
 */
class GiftRegistryPDF {
    /**
     * 创建一个 PDF 生成器实例。
     */
    constructor(options) {
        // 1. 默认配置合并 (更简洁的写法)
        const defaults = {
            letterSpacing: 4,
            title: '礼金簿',
            giftLabel: '贺礼',
            mainFontUrl: "./static/MaShanZheng-Regular.ttf",
            giftLabelFontUrl: "./static/SourceHanSerifCN-Heavy.ttf",
            formalFontUrl: './static/NotoSansSCMedium-mini.ttf',
            itemsPerPage: 10
        };
        
        this.options = { ...defaults, ...options };
        
        // 确保后续使用的字体URL存在默认值
        this.options.amountFontUrl = this.options.amountFontUrl || this.options.formalFontUrl;
        this.options.coverFontUrl = this.options.coverFontUrl || this.options.formalFontUrl;

        this.pdfLib = PDFLib;
        this.pageSize = [595.28, 841.89]; // A4 竖向
        this.coverPageSize = [595.28, 841.89]; // A4 竖向
        
        // 边距定义
        this.mainPageMargins = { top: 31, bottom: 98, left: 18.5, right: 18.5 };
        this.appendixMargins = { top: 70, bottom: 45, left: 60, right: 60 };
        this.footerMargins = { left: 30, right: 30 };

        // 资源状态
        this.resources = {
            fontBytes: null, amountFontBytes: null, formalFontBytes: null,
            giftLabelFontBytes: null, coverFontBytes: null,
            bgImageBytes: null, coverImageBytes: null,
            loaded: false
        };

        this._applyStyleConfig();
    }


    _applyStyleConfig() {
        const overrides = this.options.giftBookStyles || {};

        // 辅助函数：解析数字，无效则返回默认值
        const getNum = (val, def) => (Number.isFinite(Number(val)) && Number(val) > 0) ? Number(val) : def;
        
        // 辅助函数：解析颜色，支持 Hex/RGB，失败则返回默认值
        const getCol = (val, def) => this._parseColor(val || def);

        // 辅助函数：快速生成标准样式对象 { fontSize, color }
        const resolveStyle = (key, defaultSize, defaultColor) => ({
            fontSize: getNum(overrides[key]?.fontSize, defaultSize),
            color: getCol(overrides[key]?.color, defaultColor)
        });

        // 1. 生成各部分样式
        this.styles = {
            name:      resolveStyle('name', 20, '#333333'),
            label:     resolveStyle('label', 20, '#cc0000'),
            amount:    resolveStyle('amount', 20, '#333333'),
            coverText: resolveStyle('coverText', 30, '#f5d4ab'),
            pageInfo: {
                fontSize:   getNum(overrides.pageInfo?.fontSize, 12),
                themeColor: getCol(overrides.pageInfo?.themeColor, '#ec403c'),
                baseColor:  getCol(overrides.pageInfo?.baseColor, '#1f2937')
            }
        };

        // 2. 定义常用颜色画笔
        // 直接复用 rgb 对象，避免重复实例化
        this.colors = {
            red: this.styles.pageInfo.themeColor,
            black: this.styles.pageInfo.baseColor,
            lightPink: this.pdfLib.rgb(1, 0.94, 0.94),
            borderColor: this.pdfLib.rgb(0.99, 0.82, 0.82),
            lightOrange: this.styles.coverText.color
        };
    }

    /**
     * 优化点：使用正则简化逻辑，支持 #RGB, #RRGGBB, rgb() 格式
     */
    _parseColor(input) {
        // 如果已经是颜色对象则直接返回
        if (typeof input === 'object' && input !== null) return input;
        
        const str = String(input || '').trim();
        const { rgb } = this.pdfLib;
        const black = rgb(0, 0, 0);

        if (!str) return black;

        // 处理 Hex: #abc 或 #aabbcc
        if (str.startsWith('#')) {
            const hex = str.replace('#', '');
            if (!/^[0-9a-fA-F]{3,6}$/.test(hex)) return black;
            
            const val = hex.length === 3 ? hex.split('').map(c => c + c).join('') : hex;
            if (val.length !== 6) return black;

            const n = parseInt(val, 16);
            return rgb((n >> 16) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
        }

        // 处理 rgb(r, g, b)
        if (str.toLowerCase().startsWith('rgb')) {
            const match = str.match(/[\d\.]+/g);
            if (match && match.length >= 3) {
                const [r, g, b] = match.map(Number);
                if ([r, g, b].every(n => Number.isFinite(n))) {
                    return rgb(r / 255, g / 255, b / 255);
                }
            }
        }

        return black;
    }

    // =================================================================
    // 下方的逻辑保持原样，以保证布局绝对安全
    // =================================================================

    async _loadResources() {
        if (this.resources.loaded) return;

        const fetchResource = async (url) => {
            if (!url) return null;
            const response = await fetch(url);
            return new Uint8Array(await response.arrayBuffer());
        };

        const loadImage = async (input) => {
            if (!input) return null;
            if (input.startsWith('data:image')) {
                const base64 = input.split(',')[1];
                return Uint8Array.from(atob(base64), c => c.charCodeAt(0));
            }
            return fetchResource(input);
        };

        const [fontBytes, bgImageBytes, giftLabelFontBytes, coverImageBytes, formalFontBytes, amountFontBytes, coverFontBytes] = await Promise.all([
            fetchResource(this.options.mainFontUrl),
            fetchResource(this.options.backgroundImage),
            fetchResource(this.options.giftLabelFontUrl),
            loadImage(this.options.coverImage),
            fetchResource(this.options.formalFontUrl),
            fetchResource(this.options.amountFontUrl),
            fetchResource(this.options.coverFontUrl)
        ]);

        this.resources = {
            fontBytes, bgImageBytes, giftLabelFontBytes, coverImageBytes,
            formalFontBytes, amountFontBytes, coverFontBytes,
            loaded: true
        };
    }

    _processData(data) {
        const validData = data.filter(item => !item.abolished);
        const grandTotal = validData.reduce((sum, item) => sum + item.amount, 0);
        const remarks = data
            .map((item, index) => ({
                name: item.name,
                remark: item.remark,
                position: `第${Math.floor(index / this.options.itemsPerPage) + 1}页第${(index % this.options.itemsPerPage) + 1}人`
            }))
            .filter(r => r.remark && r.remark.trim());

        const summary = data.reduce((acc, item) => {
            const type = item.type || '其他';
            if (!acc[type]) acc[type] = { count: 0, total: 0 };
            acc[type].count++;
            acc[type].total += item.amount;
            return acc;
        }, {});

        return {
            grandTotal,
            remarks,
            summary,
            totalItems: data.length,
            mainContentTotalPages: Math.ceil(data.length / this.options.itemsPerPage),
            validData
        };
    }

    async _addGiftsPages(pdfDoc, fonts, { validData: data, mainContentTotalPages }) {
        const [pageWidth, pageHeight] = this.pageSize;
        const margin = this.mainPageMargins;
        const tableWidth = pageWidth - margin.left - margin.right;
        const tableHeight = pageHeight - margin.top - margin.bottom;
        const colWidth = tableWidth / this.options.itemsPerPage;
        const nameStyle = this.styles.name;
        const labelStyle = this.styles.label;
        const amountStyle = this.styles.amount;
        const numericColor = this.styles.pageInfo.baseColor;

        // 与电子礼簿页面一致：序号、姓名提示、姓名、贺礼、金额、收款类型、地址、备注
        const rowPercents = [0.056, 0.082, 0.139, 0.082, 0.209, 0.056, 0.082, 0.118, 0.056, 0.118];
        const rowHeights = rowPercents.map((p) => tableHeight * p);

        for (let p = 0; p < mainContentTotalPages; p++) {
            const page = pdfDoc.addPage(this.pageSize);
            await this._drawImageOnPage(pdfDoc, page, this.resources.bgImageBytes);
            page.drawRectangle({ x: margin.left, y: margin.bottom, width: tableWidth, height: tableHeight, borderColor: this.colors.red, borderWidth: 2 });

            const pageData = data.slice(p * this.options.itemsPerPage, (p + 1) * this.options.itemsPerPage);
            let rowTop = pageHeight - margin.top;
            const rowTops = [];
            for (let r = 0; r < rowHeights.length; r++) {
                rowTops.push(rowTop);
                rowTop -= rowHeights[r];
                if (r < rowHeights.length - 1) {
                    page.drawLine({ start: { x: margin.left, y: rowTop }, end: { x: pageWidth - margin.right, y: rowTop }, color: this.colors.red, thickness: 1 });
                }
            }
            for (let i = 1; i < this.options.itemsPerPage; i++) {
                const lineX = margin.left + i * colWidth;
                page.drawLine({ start: { x: lineX, y: margin.bottom }, end: { x: lineX, y: pageHeight - margin.top }, color: this.colors.red, thickness: 1 });
            }

            for (let i = 0; i < this.options.itemsPerPage; i++) {
                const item = pageData[i];
                const colX = margin.left + i * colWidth;
                const drawCentered = (text, rowIndex, font, size, color, vertical = true) => {
                    if (!text) return;
                    this._drawText(page, String(text), font, {
                        x: colX,
                        y: rowTops[rowIndex] - rowHeights[rowIndex],
                        cellWidth: colWidth,
                        cellHeight: rowHeights[rowIndex],
                        initialFontSize: size,
                        minFontSize: 7,
                        color,
                        isVertical: vertical
                    });
                };

                // 空白栏仍保留传统礼簿红色提示文字
                drawCentered(item ? String(p * this.options.itemsPerPage + i + 1) : "", 0, fonts.formalFont, 13, this.colors.black, false);
                drawCentered("姓名", 1, fonts.giftLabelFont, labelStyle.fontSize, labelStyle.color, true);

                if (item) {
                    // 姓名按模板：三字为基准；两字分别落在首、尾位置；四字均匀居中。
                    const nameChars = Array.from(item.name || '').slice(0, 4);
                    if (nameChars.length) {
                        const rh = rowHeights[2];
                        const fs = nameStyle.fontSize;
                        const charH = fs * 1.18;
                        const totalSlots = nameChars.length === 2 ? 3 : nameChars.length;
                        const slotH = rh / totalSlots;
                        const positions = nameChars.length === 2 ? [0, 2] : nameChars.map((_, idx) => idx);
                        positions.forEach((slot, idx) => {
                            const ch = nameChars[idx];
                            const w = fonts.mainFont.widthOfTextAtSize(ch, fs);
                            const cx = colX + (colWidth - w) / 2;
                            const cy = rowTops[2] - slotH * (slot + 1) + Math.max(0, (slotH - charH) / 2);
                            page.drawText(ch, { x: cx, y: cy, font: fonts.mainFont, size: fs, color: nameStyle.color });
                        });
                    }
                }

                drawCentered(this.options.giftLabel, 3, fonts.giftLabelFont, labelStyle.fontSize, labelStyle.color, true);

                if (item) {
                    // 大写金额在上、阿拉伯数字在下
                    const amountText = item.amountText || String(item.amount);
                    const amountLen = Array.from(amountText).length;
                    const amountFs = amountLen <= 3 ? amountStyle.fontSize : amountLen === 4 ? Math.min(amountStyle.fontSize, 24) : amountLen === 5 ? 21 : amountLen === 6 ? 19 : amountLen === 7 ? 17 : 15;
                    const amountBigHeight = rowHeights[4] * 0.78;
                    this._drawText(page, amountText, fonts.amountFont, {
                        x: colX, y: rowTops[4] - amountBigHeight,
                        cellWidth: colWidth, cellHeight: amountBigHeight,
                        initialFontSize: amountFs, minFontSize: 7,
                        color: amountStyle.color, isVertical: true, noWrap: true
                    });
                    this._drawText(page, `￥${item.amount}`, fonts.formalFont, {
                        x: colX, y: rowTops[4] - rowHeights[4],
                        cellWidth: colWidth, cellHeight: rowHeights[4] * 0.22,
                        initialFontSize: 12, minFontSize: 6,
                        color: numericColor, isVertical: false
                    });
                    drawCentered(item.type || "", 5, fonts.formalFont, 12, this.colors.black, false);
                    drawCentered("地址", 6, fonts.giftLabelFont, labelStyle.fontSize, labelStyle.color, true);
                    if (item.address) {
                        const text = String(item.address).replace(/\s+/g, '');
                        const len = Array.from(text).length;
                        const size = len <= 3 ? 14 : len === 4 ? 12 : len === 5 ? 10.5 : len === 6 ? 9 : 8;
                        this._drawText(page, text, fonts.formalFont, {
                            x: colX + 5, y: rowTops[7] - rowHeights[7] + 4,
                            cellWidth: colWidth - 8, cellHeight: rowHeights[7] - 8,
                            initialFontSize: size, minFontSize: 6, color: this.colors.black, isVertical: true, align: 'center', noWrap: false
                        });
                    }
                    drawCentered("备注", 8, fonts.giftLabelFont, labelStyle.fontSize, labelStyle.color, true);
                    if (item.remark) {
                        const text = String(item.remark).replace(/\s+/g, '');
                        const len = Array.from(text).length;
                        const size = len <= 3 ? 14 : len === 4 ? 12 : len === 5 ? 10.5 : len === 6 ? 9 : 8;
                        this._drawText(page, text, fonts.formalFont, {
                            x: colX + 5, y: rowTops[9] - rowHeights[9] + 4,
                            cellWidth: colWidth - 8, cellHeight: rowHeights[9] - 8,
                            initialFontSize: size, minFontSize: 6, color: this.colors.black, isVertical: true, align: 'center', noWrap: false
                        });
                    }
                } else {
                    drawCentered("地址", 6, fonts.giftLabelFont, labelStyle.fontSize, labelStyle.color, true);
                    drawCentered("备注", 8, fonts.giftLabelFont, labelStyle.fontSize, labelStyle.color, true);
                }
            }

            const pageSubtotal = pageData.reduce((sum, item) => sum + item.amount, 0);
            let pageInfo = `第 ${p + 1} 页 / 共 ${mainContentTotalPages} 页`;
            if (this.options.partIndex && this.options.totalParts) pageInfo += `( P${this.options.partIndex}/P${this.options.totalParts} )`;
            this._drawPageFooter(page, fonts.formalFont, {
                left: `生成日期: ${new Date().toLocaleString('sv-SE')}`,
                center: pageInfo,
                right: `本页小计: ${this._formatRMB(pageSubtotal)}`
            });
        }
    }


    async _addSummaryAppendix(pdfDoc, fonts, processedData) {
        if (!processedData || Object.keys(processedData.summary).length === 0) return;

        const page = pdfDoc.addPage(this.pageSize);
        await this._drawImageOnPage(pdfDoc, page, this.resources.bgImageBytes);

        const mainFont = fonts.formalFont;
        const [pageWidth, pageHeight] = this.pageSize;
        const margin = this.appendixMargins;

        const title = "总计";
        const titleWidth = mainFont.widthOfTextAtSize(title, 28);
        page.drawText(title, { x: (pageWidth - titleWidth) / 2, y: pageHeight - margin.top, size: 28, font: mainFont, color: this.colors.red });

        const tableTopY = pageHeight - margin.top - 40;
        const summaryData = Object.entries(processedData.summary).map(([type, values]) => ({
            method: type, count: `${values.count} 人`, amount: this._formatRMB(values.total)
        }));

        const tableData = [...summaryData];
        const partTotalItems = processedData.totalItems;
        const partTotalAmount = processedData.grandTotal;

        if (this.options.partIndex && this.options.totalParts) {
            tableData.push({ method: "本部分总计", count: `${partTotalItems} 人`, amount: this._formatRMB(partTotalAmount) });
            tableData.push({ method: "事项总金额", count: `${this.options.grandTotalGivers || 0} 人`, amount: this._formatRMB(this.options.grandTotalAmount) });
        } else {
            tableData.push({ method: "总计", count: `${partTotalItems} 人`, amount: this._formatRMB(partTotalAmount) });
        }

        const tableWidth = pageWidth - margin.left - margin.right;
        const colWidths = [tableWidth * 0.3, tableWidth * 0.25, tableWidth * 0.45];
        const rowHeight = 40;
        const headerHeight = 30;

        let cursorY = tableTopY;
        const tableHeaders = ["送礼方式", "人数", "总金额"];

        let currentX = margin.left;
        tableHeaders.forEach((headerText, colIndex) => {
            const textWidth = mainFont.widthOfTextAtSize(headerText, 14);
            page.drawText(headerText, {
                x: currentX + (colWidths[colIndex] - textWidth) / 2, y: cursorY - headerHeight / 2 - 6,
                font: mainFont, size: 14, color: this.colors.black
            });
            currentX += colWidths[colIndex];
        });

        page.drawLine({ start: { x: margin.left, y: cursorY - headerHeight }, end: { x: margin.left + tableWidth, y: cursorY - headerHeight }, color: this.colors.red, thickness: 0.8 });
        cursorY -= headerHeight;

        tableData.forEach((rowData) => {
            const cells = [rowData.method, rowData.count, rowData.amount];
            currentX = margin.left;
            cells.forEach((cellText, colIndex) => {
                const textWidth = mainFont.widthOfTextAtSize(cellText, 14);
                page.drawText(cellText, {
                    x: currentX + (colWidths[colIndex] - textWidth) / 2, y: cursorY - rowHeight / 2 - 7,
                    font: mainFont, size: 14, color: this.colors.black
                });
                currentX += colWidths[colIndex];
            });
            page.drawLine({ start: { x: margin.left, y: cursorY - rowHeight }, end: { x: margin.left + tableWidth, y: cursorY - rowHeight }, color: this.colors.red, thickness: 0.8 });
            cursorY -= rowHeight;
        });

        const tableBottomY = cursorY;
        page.drawLine({ start: { x: margin.left, y: tableTopY }, end: { x: margin.left + tableWidth, y: tableTopY }, color: this.colors.red, thickness: 1.2 });
        page.drawLine({ start: { x: margin.left, y: tableBottomY }, end: { x: margin.left + tableWidth, y: tableBottomY }, color: this.colors.red, thickness: 1.2 });
        page.drawLine({ start: { x: margin.left, y: tableTopY }, end: { x: margin.left, y: tableBottomY }, color: this.colors.red, thickness: 1.2 });
        page.drawLine({ start: { x: margin.left + tableWidth, y: tableTopY }, end: { x: margin.left + tableWidth, y: tableBottomY }, color: this.colors.red, thickness: 1.2 });

        let lineX = margin.left;
        for (let i = 0; i < colWidths.length - 1; i++) {
            lineX += colWidths[i];
            page.drawLine({ start: { x: lineX, y: tableTopY }, end: { x: lineX, y: tableBottomY }, color: this.colors.red, thickness: 0.8 });
        }

        {
            const recorderText = `记账人： ${this.options.recorder || ''}`;
            const recorderTextWidth = mainFont.widthOfTextAtSize(recorderText, 18);
            const dateTextWidth = this.options.subtitle ? mainFont.widthOfTextAtSize(this.options.subtitle, 18) : 0;
            const maxWidth = Math.max(recorderTextWidth, dateTextWidth);
            const boxStartX = pageWidth - this.appendixMargins.right - maxWidth - 45;
            let cursorY = tableBottomY - 60;

            {
                const centeredX = boxStartX + (maxWidth - recorderTextWidth) / 2;
                page.drawText(recorderText, { x: centeredX, y: cursorY, font: mainFont, size: 18, color: this.colors.black });
                cursorY -= 30;
            }
            if (this.options.subtitle) {
                const centeredX = boxStartX + (maxWidth - dateTextWidth) / 2;
                page.drawText(this.options.subtitle, { x: centeredX, y: cursorY, font: mainFont, size: 18, color: this.colors.black });
            }
        }
    }


    _drawPageFooter(page, font, { left = "", center = "", right = "" } = {}) {
        if (!font) return;
        const [pageWidth] = this.pageSize;
        const y = 14;
        const size = 7;
        if (left) page.drawText(left, { x: this.footerMargins.left, y, font, size, color: this.colors.black });
        if (center) { const w = font.widthOfTextAtSize(center, size); page.drawText(center, { x: (pageWidth - w) / 2, y, font, size, color: this.colors.black }); }
        if (right) { const w = font.widthOfTextAtSize(right, size); page.drawText(right, { x: pageWidth - this.footerMargins.right - w, y, font, size, color: this.colors.black }); }
    }


    _drawText(page, text, font, opts = {}) {
        if (!text || !font) return;
        const { x = 0, y = 0, cellWidth = 100, cellHeight = 100, initialFontSize = 12, minFontSize = 7, color = this.colors.black, isVertical = false } = opts;
        const value = String(text);
        let size = initialFontSize;
        if (isVertical) {
            const chars = Array.from(value.replace(/\s+/g, ''));
            if (!chars.length) return;
            const gap = Math.max(1, size * 0.12);
            const total = chars.length * size + Math.max(0, chars.length - 1) * gap;
            const scale = Math.min(1, (cellHeight - 8) / Math.max(total, 1));
            size = Math.max(minFontSize, size * scale);
            const lineHeight = size * 1.12;
            const totalHeight = chars.length * lineHeight;
            let cy = y + (cellHeight + totalHeight) / 2 - lineHeight;
            // PDF坐标系从下往上；这里用旋转0度逐字上下排列，避免横向并列。
            chars.forEach((ch) => {
                const w = font.widthOfTextAtSize(ch, size);
                page.drawText(ch, {
                    x: x + (cellWidth - w) / 2,
                    y: cy,
                    font, size, color
                });
                cy -= lineHeight;
            });
            return;
        }
        const width = font.widthOfTextAtSize(value, size);
        const fitted = width > cellWidth - 6 ? Math.max(minFontSize, size * ((cellWidth - 6) / width)) : size;
        const finalWidth = font.widthOfTextAtSize(value, fitted);
        const finalHeight = fitted;
        page.drawText(value, {
            x: x + (cellWidth - finalWidth) / 2,
            y: y + (cellHeight - finalHeight) / 2,
            font, size: fitted, color
        });
    }

    _formatRMB(amount) {
        const num = parseFloat(amount);
        return new Intl.NumberFormat("zh-CN", { style: "currency", currency: "CNY" }).format(num || 0);
    }

    async generate(data, newOptions = null) {
        if (!Array.isArray(data) || data.length === 0) {
            throw new Error('数据必须是一个非空数组。');
        }

        if (newOptions) {
            Object.assign(this.options, newOptions);
            this.resources.loaded = false;
            this._applyStyleConfig();
        }

        await this._loadResources();

        const { PDFDocument } = this.pdfLib;
        const pdfDoc = await PDFDocument.create();
        pdfDoc.registerFontkit(fontkit);

        const fonts = {
            mainFont: await pdfDoc.embedFont(this.resources.fontBytes, { subset: true }),
            giftLabelFont: this.resources.giftLabelFontBytes ? await pdfDoc.embedFont(this.resources.giftLabelFontBytes, { subset: true }) : null,
            formalFont: this.resources.formalFontBytes ? await pdfDoc.embedFont(this.resources.formalFontBytes, { subset: true }) : null,
            amountFont: this.resources.amountFontBytes ? await pdfDoc.embedFont(this.resources.amountFontBytes, { subset: true }) : null,
            coverFont: this.resources.coverFontBytes ? await pdfDoc.embedFont(this.resources.coverFontBytes, { subset: true }) : null
        };
        fonts.giftLabelFont = fonts.giftLabelFont || fonts.mainFont;
        fonts.formalFont = fonts.formalFont || fonts.mainFont;
        fonts.amountFont = fonts.amountFont || fonts.mainFont;
        fonts.coverFont = fonts.coverFont || fonts.formalFont;

        const processedData = this._processData(data);

        if (this.options.printCover && this.resources.coverImageBytes) {
            // cover1.jpg 是一张横向展开图：左半为底封面，右半为正封面。
            // 直接把整图按 2×A4 竖版尺寸绘制到两页，书脊处自然连续。
            const coverFont = fonts.coverFont || fonts.formalFont;
            const coverStyle = this.styles?.coverText || {};
            const coverColor = coverStyle.color || this.colors.lightOrange;
            const coverFontSize = coverStyle.fontSize || 26;
            const [coverWidth, coverHeight] = this.coverPageSize;
            const spreadImage = await (async () => {
                try {
                    return await pdfDoc.embedJpg(this.resources.coverImageBytes);
                } catch (e) {
                    return await pdfDoc.embedPng(this.resources.coverImageBytes);
                }
            })();

            // 正封面：右半幅（含“嘉宾礼簿”），下方增加事项类型、阳历、农历。
            {
                const coverPage = pdfDoc.addPage(this.coverPageSize);
                coverPage.drawImage(spreadImage, { x: -coverWidth, y: 0, width: coverWidth * 2, height: coverHeight });
                const eventDate = this.options.eventDate ? new Date(this.options.eventDate) : null;
                const gregorian = eventDate && !Number.isNaN(eventDate.getTime()) ? `${eventDate.getFullYear()}年${eventDate.getMonth()+1}月${eventDate.getDate()}日` : '';
                let lunar = '';
                try {
                    const parts = eventDate ? new Intl.DateTimeFormat('zh-CN-u-ca-chinese', {year:'numeric', month:'long', day:'numeric'}).formatToParts(eventDate) : [];
                    const y = Number(parts.find(p => p.type === 'relatedYear')?.value || '');
                    const m = parts.find(p => p.type === 'month')?.value || '';
                    const d = parts.find(p => p.type === 'day')?.value || '';
                    if (y) {
                        const stems = '甲乙丙丁戊己庚辛壬癸', branches = '子丑寅卯辰巳午未申酉戌亥';
                        const dayNum = Number(String(d).replace(/[^0-9]/g, '')); const dayNames = ['', '初一','初二','初三','初四','初五','初六','初七','初八','初九','初十','十一','十二','十三','十四','十五','十六','十七','十八','十九','二十','廿一','廿二','廿三','廿四','廿五','廿六','廿七','廿八','廿九','三十']; const dayCn = dayNames[dayNum] || String(d).replace(/[0-9]/g, ''); const monthCn = String(m).replace(/[0-9]/g, ''); lunar = `${stems[(y-4+10)%10]}${branches[(y-4+12)%12]}年 ${monthCn}${dayCn}`;
                    }
                } catch(e) {}
                const title = `${this.options.title || ''}`;
                if (title) {
                    const titleSize = Math.max(22, coverFontSize || 26);
                    const titleH = coverFont.heightAtSize(titleSize);
                    coverPage.drawText(title, { x: coverWidth * 0.41, y: coverHeight * 0.30, font: coverFont, size: titleSize, color: coverColor, rotate: PDFLib.degrees(90) });
                }
                const dateLines = [gregorian, lunar].filter(Boolean);
                dateLines.forEach((txt, idx) => { const w = coverFont.widthOfTextAtSize(txt, 14); coverPage.drawText(txt, { x:(coverWidth-w)/2, y:55-idx*22, font:coverFont, size:14, color:coverColor }); });
            }
        }

        await this._addGiftsPages(pdfDoc, fonts, processedData);


        if (this.options.printSummary !== false) {
            await this._addSummaryAppendix(pdfDoc, fonts, processedData);
        }

        // 底封面：同一张横向壁纸左半，放在总计页之后。
        if (this.options.printCover && this.resources.coverImageBytes) {
            const [coverWidth, coverHeight] = this.coverPageSize;
            const spreadImage = await (async () => {
                try { return await pdfDoc.embedJpg(this.resources.coverImageBytes); }
                catch (e) { return await pdfDoc.embedPng(this.resources.coverImageBytes); }
            })();
            const coverPage = pdfDoc.addPage(this.coverPageSize);
            coverPage.drawImage(spreadImage, { x: 0, y: 0, width: coverWidth * 2, height: coverHeight });
            const backCoverFont = fonts.coverFont || fonts.formalFont;
            const backCoverColor = (this.styles?.coverText?.color) || this.colors.lightOrange;
            const backText = '礼成';
            const backW = backCoverFont.widthOfTextAtSize(backText, 24);
            coverPage.drawText(backText, { x:(coverWidth-backW)/2, y:70, font:backCoverFont, size:24, color:backCoverColor });
            const backDate = this.options.eventDate ? new Date(this.options.eventDate) : null;
            if (backDate && !Number.isNaN(backDate.getTime())) {
                const txt = `${backDate.getFullYear()}年${backDate.getMonth()+1}月${backDate.getDate()}日`;
                const w = backCoverFont.widthOfTextAtSize(txt, 14);
                coverPage.drawText(txt, { x:(coverWidth-w)/2, y:45, font:backCoverFont, size:14, color:backCoverColor });
            }
        }

        return pdfDoc.save();
    }
}