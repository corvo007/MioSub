const fs = require('fs');
const path = require('path');
const https = require('https');
const AdmZip = require('adm-zip');

const WHISPER_VERSION = 'v1.7.1';
const DOWNLOAD_URL = `https://github.com/ggerganov/whisper.cpp/releases/download/${WHISPER_VERSION}/whisper-bin-x64.zip`;
const RESOURCES_DIR = path.join(__dirname, '../resources');
const TARGET_FILE = path.join(RESOURCES_DIR, 'whisper-server.exe');

async function downloadFile(url, dest) {
    return new Promise((resolve, reject) => {
        const file = fs.createWriteStream(dest);
        https.get(url, (response) => {
            if (response.statusCode === 302 || response.statusCode === 301) {
                downloadFile(response.headers.location, dest).then(resolve).catch(reject);
                return;
            }
            response.pipe(file);
            file.on('finish', () => {
                file.close(resolve);
            });
        }).on('error', (err) => {
            fs.unlink(dest, () => { });
            reject(err);
        });
    });
}

async function main() {
    if (!fs.existsSync(RESOURCES_DIR)) {
        fs.mkdirSync(RESOURCES_DIR, { recursive: true });
    }

    // Check if already exists
    if (fs.existsSync(TARGET_FILE)) {
        console.log('whisper-server.exe already exists. Skipping download.');
        return;
    }

    console.log(`Downloading whisper.cpp ${WHISPER_VERSION}...`);
    const zipPath = path.join(RESOURCES_DIR, 'whisper.zip');

    try {
        await downloadFile(DOWNLOAD_URL, zipPath);
        console.log('Download complete. Extracting...');

        const zip = new AdmZip(zipPath);
        const zipEntries = zip.getEntries();

        zipEntries.forEach((entry) => {
            if (entry.entryName === 'server.exe') {
                zip.extractEntryTo(entry, RESOURCES_DIR, false, true);
                fs.renameSync(path.join(RESOURCES_DIR, 'server.exe'), TARGET_FILE);
                console.log('Extracted and renamed server.exe to whisper-server.exe');
            } else if (entry.entryName.endsWith('.dll')) {
                zip.extractEntryTo(entry, RESOURCES_DIR, false, true);
                console.log(`Extracted ${entry.entryName}`);
            }
        });

        // Cleanup
        fs.unlinkSync(zipPath);
        console.log('Done!');
    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
}

main();
