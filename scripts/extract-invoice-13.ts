import { writeFileSync } from "fs";

async function main() {
    console.log("Fetching Invoice 13 data from local dev server...");
    try {
        const res = await fetch("http://localhost:3000/api/invoices/13");
        if (!res.ok) {
            throw new Error(`Failed to fetch: ${res.statusText}`);
        }
        const data = await res.json();

        console.log("Data fetched successfully. Saving to src/app/invoices/13-static-data.json...");
        writeFileSync("./src/app/invoices/13-static-data.json", JSON.stringify(data, null, 2));
        console.log("Done.");
    } catch (e) {
        console.error("Error:", e);
    }
}

main();
