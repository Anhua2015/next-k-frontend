import fs from "node:fs";

const htmlFiles = ["index.html", "binance.html"];

for (const file of htmlFiles) {
    const html = fs.readFileSync(file, "utf8");
    const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)]
        .map((match) => match[1])
        .filter(Boolean);

    scripts.forEach((source, index) => {
        try {
            // 仅做语法编译，不执行页面代码或发起网络请求。
            new Function(source);
        } catch (error) {
            throw new Error(`${file} inline script ${index + 1}: ${error.message}`);
        }
    });
}

console.log("Inline JavaScript syntax check passed.");
