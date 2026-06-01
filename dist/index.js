#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { logger } from "./logger.js";
import { getCompanyInfo, searchCompanies } from "./scraper.js";
const server = new McpServer({
    name: "allabolag",
    version: "1.0.0",
});
logger.log("Starting server");
server.tool("search-companies", "Search for companies by name or location", { query: z.string().describe("Search query for company name or location") }, async ({ query }) => {
    logger.log("Starting search-companies tool with query:", query);
    try {
        logger.log("Calling searchCompanies function...");
        const results = await searchCompanies(query);
        logger.log("Search results received:", results);
        if (results.length === 0) {
            logger.log("No results found");
            return {
                content: [{ type: "text", text: "No companies found matching your search criteria." }],
            };
        }
        logger.log(`Found ${results.length} companies`);
        const formattedResults = results.map(company => ([
            `${company.name} (${company.orgNumber})`,
            `Location: ${company.location}`,
            company.revenue ? `Revenue: ${company.revenue}` : null,
            company.employees ? `Employees: ${company.employees}` : null,
            `Details: call get-company-info with orgnr "${company.orgNumber}"`,
        ].filter(Boolean).join("\n") + "\n")).join("\n");
        return {
            content: [{ type: "text", text: formattedResults }],
        };
    }
    catch (error) {
        logger.log("Error in search-companies:", error);
        return {
            content: [{ type: "text", text: `Error: ${error.message}` }],
            isError: true,
        };
    }
});
server.tool("get-company-info", "Get detailed company information by Swedish organisation number (orgnr) from a search result", { orgnr: z.string().describe("Swedish organisation number, e.g. 559568-6196 (from search-companies)") }, async ({ orgnr }) => {
    logger.log("using tool get-company-info");
    try {
        const info = await getCompanyInfo(orgnr);
        const formattedInfo = [
            `Company Name: ${info.name}`,
            `Organization Number: ${info.orgNumber}`,
            `Location: ${info.location}`,
            `Status: ${info.status}`,
            info.ceo ? `CEO / contact: ${info.ceo}` : null,
            info.revenue ? `Revenue: ${info.revenue}` : null,
            info.profit ? `Profit: ${info.profit}` : null,
            info.employees ? `Employees: ${info.employees}` : null,
            info.phone ? `Phone: ${info.phone}` : null,
            info.email ? `Email: ${info.email}` : null,
            info.industry?.length ? `Industries: ${info.industry.join(", ")}` : null,
            info.description ? `\nDescription: ${info.description}` : null,
        ]
            .filter(Boolean)
            .join("\n");
        return {
            content: [{ type: "text", text: formattedInfo }],
        };
    }
    catch (error) {
        return {
            content: [{ type: "text", text: `Error: ${error.message}` }],
            isError: true,
        };
    }
});
logger.log("Server started");
const transport = new StdioServerTransport();
await server.connect(transport);
