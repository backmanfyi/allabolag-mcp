import axios from 'axios';
import * as cheerio from 'cheerio';
import { logger } from './logger.js';
export async function searchCompanies(query) {
    try {
        const encodedQuery = encodeURIComponent(query);
        const url = `https://www.allabolag.se/bransch-s%C3%B6k?q=${encodedQuery}`;
        logger.log('Fetching URL:', url);
        const response = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.5',
                'Connection': 'keep-alive',
            }
        });
        logger.log('Response received, status:', response.status);
        const $ = cheerio.load(response.data);
        const results = [];
        // Debug: Log the entire HTML to check structure
        logger.log('Page HTML:', response.data.substring(0, 500) + '...');
        // First try the search results container
        const searchContainer = $('.MuiGrid-root.SearchResultCard-card');
        logger.log('Found search results:', searchContainer.length);
        searchContainer.each((_, element) => {
            try {
                const name = $(element).find('h2.MuiTypography-h3 a').first().text().trim();
                const orgNumberEl = $(element).find('.CardHeader-propertyList').filter((_, el) => $(el).text().includes('Org.nr'));
                const orgNumber = orgNumberEl.text().replace('Org.nr', '').trim();
                const location = $(element).find('.fa-location-dot').parent().text().trim();
                const link = $(element).find('h2.MuiTypography-h3 a').first().attr('href') || '';
                const revenueEl = $(element).find('.CardHeader-propertyBlock').filter((_, el) => $(el).text().includes('Omsättning'));
                const revenue = revenueEl.text().replace('Omsättning', '').replace(/\\d{4}/, '').trim();
                const employeesEl = $(element).find('.CardHeader-propertyBlock').filter((_, el) => $(el).text().includes('Anställda'));
                const employees = employeesEl.text().replace('Anställda', '').trim();
                logger.log('Found company:', { name, orgNumber, location, link });
                if (name && orgNumber) {
                    results.push({
                        name,
                        orgNumber,
                        location,
                        link,
                        revenue: revenue || undefined,
                        employees: employees || undefined
                    });
                }
            }
            catch (err) {
                logger.log('Error parsing company element:', err);
            }
        });
        logger.log('Total results found:', results.length);
        return results;
    }
    catch (error) {
        logger.log('Error searching companies:', error);
        throw new Error('Failed to search companies');
    }
}
export async function getCompanyInfo(path) {
    try {
        const url = `https://www.allabolag.se${path}`;
        logger.log('Fetching company URL:', url);
        const response = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.5',
                'Connection': 'keep-alive',
            }
        });
        logger.log('Response received, status:', response.status);
        const $ = cheerio.load(response.data);
        // Get the title which contains both name and org number
        const title = $('title').text().trim();
        const titleMatch = title.match(/^(.+?) - (\d{6}-\d{4})/);
        logger.log('Title match:', titleMatch);
        if (!titleMatch) {
            throw new Error('Could not parse company name and org number from title');
        }
        const [, name, orgNumber] = titleMatch;
        logger.log('Found name:', name);
        logger.log('Found org number:', orgNumber);
        // Get location from meta description
        const metaDescription = $('meta[name="description"]').attr('content') || '';
        logger.log('Meta description:', metaDescription);
        // Look for address in the page content
        const location = $('.fa-location-dot').parent().text().trim();
        logger.log('Found location:', location);
        // Get phone number if available
        const phone = $('.fa-phone-flip').parent().text().replace('Telefon', '').trim();
        logger.log('Found phone:', phone);
        // Get company metrics
        const metrics = $('.CardHeader-propertyBlock');
        let revenue;
        let employees;
        metrics.each((_, el) => {
            const text = $(el).text().trim();
            if (text.includes('Omsättning')) {
                revenue = text.replace('Omsättning', '').replace(/\d{4}/, '').trim();
            }
            else if (text.includes('Anställda')) {
                employees = text.replace('Anställda', '').trim();
            }
        });
        logger.log('Found revenue:', revenue);
        logger.log('Found employees:', employees);
        // Get industry tags
        const industries = [];
        $('.IndustryTags-tags .Tag-root a').each((_, element) => {
            industries.push($(element).text().trim());
        });
        logger.log('Found industries:', industries);
        // Get company description if available
        const description = $('.company-description').text().trim();
        logger.log('Found description:', description);
        const result = {
            name,
            orgNumber,
            location,
            status: 'Active', // Default to active since we can see the page
            revenue,
            employees,
            description: description || undefined,
            phone: phone || undefined,
            industry: industries.length > 0 ? industries : undefined
        };
        logger.log('Final result:', result);
        return result;
    }
    catch (error) {
        logger.log('Error getting company info:', error);
        if (error instanceof Error) {
            logger.log('Error details:', { message: error.message, stack: error.stack });
        }
        throw new Error('Failed to get company information');
    }
}
