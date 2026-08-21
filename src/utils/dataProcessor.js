import { parse, addHours, format, isValid } from 'date-fns';
import { prizeMapping, productMapping, campaignMapping, regionMapping, prizeStatusMapping } from './mappings';

const getVal = (row, keyName) => {
  const key = Object.keys(row).find(k => k.toLowerCase() === keyName.toLowerCase());
  return key ? row[key] : undefined;
};

const parseDateString = (dateStr) => {
  if (!dateStr) return null;
  const cleanStr = String(dateStr).replace(/\s+/g, ' ').trim();
  
  let d = parse(cleanStr, 'dd.MM.yyyy HH:mm:ss', new Date());
  if (isValid(d)) return d;
  
  d = parse(cleanStr, 'dd.MM.yyyy HH:mm', new Date());
  if (isValid(d)) return d;
  
  d = parse(cleanStr, 'dd.MM.yyyy', new Date());
  if (isValid(d)) return d;
  
  d = new Date(cleanStr); // fallback to native parsing
  if (isValid(d)) return d;
  
  return null;
};

export const processCSVData = (rawDataArrays) => {
  const idMap = new Map();

  for (const rows of rawDataArrays) {
    for (const row of rows) {
      if (!row.id) continue;
      idMap.set(row.id, row);
    }
  }

  const processedData = [];

  for (const row of idMap.values()) {
    // Case-insensitive extraction
    const rawCampaign = getVal(row, 'campaign_id');
    const rawPrize = getVal(row, 'prize_id');
    const rawProduct = getVal(row, 'product_id');
    const rawRegion = getVal(row, 'region_id');
    const rawWinDate = getVal(row, 'win_date');
    const rawCreateDate = getVal(row, 'created_date');
    
    // Process win_date (add 4 hours)
    let parsedWinDate = parseDateString(rawWinDate);
    let formattedWinDate = rawWinDate || '';
    let dayKey = '';

    if (parsedWinDate) {
      parsedWinDate = addHours(parsedWinDate, 4);
      formattedWinDate = format(parsedWinDate, 'dd.MM.yyyy HH:mm:ss');
      dayKey = format(parsedWinDate, 'yyyy-MM-dd');
    }

    // Process created_date (add 4 hours, assuming it also needs it based on prompt "тот же формат времени")
    let parsedCreateDate = parseDateString(rawCreateDate);
    let formattedCreateDate = rawCreateDate || '';
    if (parsedCreateDate) {
      parsedCreateDate = addHours(parsedCreateDate, 4);
      formattedCreateDate = format(parsedCreateDate, 'dd.MM.yyyy HH:mm:ss');
    }

    // Resolve mappings
    const campaignName = campaignMapping[rawCampaign] || rawCampaign || 'Unknown';
    const prizeName = prizeMapping[rawPrize] || rawPrize || 'Unknown';
    const productName = productMapping[rawProduct] || rawProduct || 'Unknown';
    const regionName = regionMapping[rawRegion] || rawRegion || 'Unknown';
    
    // won_prize_status mapping
    let prizeStatus = getVal(row, 'won_prize_status');
    if (prizeStatus === null || prizeStatus === undefined || prizeStatus === 'null' || prizeStatus === '') {
      prizeStatus = 'null';
    }
    const prizeStatusName = prizeStatusMapping[prizeStatus] || prizeStatus || 'Unknown';

    processedData.push({
      ...row,
      win_date_adjusted: formattedWinDate,
      win_date_parsed: parsedWinDate,
      created_date_adjusted: formattedCreateDate,
      created_date_parsed: parsedCreateDate,
      day_key: dayKey,
      CampaignName: campaignName,
      PrizeName: prizeName,
      rawPrize: rawPrize,
      ProductName: productName,
      RegionName: regionName,
      PrizeStatusName: prizeStatusName,
    });
  }

  // Sort by date descending
  processedData.sort((a, b) => {
    if (a.win_date_parsed && b.win_date_parsed) {
      return b.win_date_parsed - a.win_date_parsed;
    }
    return 0;
  });

  return processedData;
};
