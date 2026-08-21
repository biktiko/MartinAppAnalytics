import React, { useState } from 'react';
import { subDays, startOfDay } from 'date-fns';

const Reports = ({ data, filteredData }) => {
  // Helper to extract numeric value from prize name
  const getPrizeValue = (prizeName) => {
    if (!prizeName) return 0;
    const match = prizeName.match(/\d+/);
    return match ? parseInt(match[0], 10) : 0;
  };

  const todayStr = startOfDay(new Date()).toISOString();
  
  // Custom yesterday check using parsed date
  const isDateYesterday = (dateObj) => {
    if (!dateObj) return false;
    const yesterday = subDays(startOfDay(new Date()), 1);
    const dateStart = startOfDay(dateObj);
    return dateStart.getTime() === yesterday.getTime();
  };

  const getNewUsersYesterday = (reportData) => {
    // Reports unconditionally ignore dashboard filters for new users logic
    const baseData = data;
    const userFirstScan = new Map();
    const sortedAsc = [...baseData].sort((a,b) => (a.win_date_parsed || 0) - (b.win_date_parsed || 0));
    sortedAsc.forEach(d => {
      if (d.customer_id && d.win_date_parsed) {
        if (!userFirstScan.has(d.customer_id)) {
          userFirstScan.set(d.customer_id, d.win_date_parsed);
        }
      }
    });

    let newUsersCount = 0;
    const reportUsersYesterday = new Set(reportData.filter(d => isDateYesterday(d.win_date_parsed)).map(d => d.customer_id));
    
    reportUsersYesterday.forEach((uid) => {
      if (userFirstScan.has(uid) && isDateYesterday(userFirstScan.get(uid))) {
        newUsersCount++;
      }
    });
    return newUsersCount;
  };

  // ----------------------------------------------------
  // Template 1: Georgia (Campaign 5 or Name matching 'Грузии')
  // ----------------------------------------------------
  const geoThresholdDate = new Date(2026, 3, 7); // April 7, 2026

  const georgiaData = data.filter(d => {
    const isGeoCamp = String(d.campaign_id) === '5' || (d.CampaignName && d.CampaignName.toLowerCase().includes('грузи'));
    const isCreatedAfter = d.created_date_parsed && d.created_date_parsed >= geoThresholdDate;
    const isWinAfter = d.win_date_parsed && d.win_date_parsed >= geoThresholdDate;
    return isGeoCamp && isCreatedAfter && isWinAfter;
  });

  const geoTotalScans = georgiaData.length;
  const geoUniqueUsers = new Set(georgiaData.map(d => d.customer_id).filter(Boolean)).size;
  
  const geoYesterdayData = georgiaData.filter(d => isDateYesterday(d.win_date_parsed));
  const geoYesterdayScans = geoYesterdayData.length;
  const geoYesterdayUsers = getNewUsersYesterday(georgiaData);

  const geoWins10 = georgiaData.filter(d => String(d.prize_id) === '49').length;
  const geoWins20 = georgiaData.filter(d => String(d.prize_id) === '50').length;
  const geoWins50 = georgiaData.filter(d => String(d.prize_id) === '51').length;

  // ----------------------------------------------------
  // Template 2: Armenia (Campaign 2 or 6 AND created_date > 10.05.2026)
  // ----------------------------------------------------
  const thresholdDate = new Date(2026, 4, 10); // May 10, 2026
  
  const armeniaData = data.filter(d => {
    const isArmeniaCamp = String(d.campaign_id) === '2' || String(d.campaign_id) === '6';
    const isAfterDate = d.created_date_parsed && d.created_date_parsed > thresholdDate;
    return isArmeniaCamp && isAfterDate;
  });

  const armTotalScans = armeniaData.length;
  const armUniqueUsers = new Set(armeniaData.map(d => d.customer_id).filter(Boolean)).size;
  
  const armYesterdayData = armeniaData.filter(d => isDateYesterday(d.win_date_parsed));
  const armYesterdayScans = armYesterdayData.length;
  const armYesterdayUsers = getNewUsersYesterday(armeniaData);

  // Prizes 54-59 are money in AMD
  // We need to figure out 'Շահումով' (Win) vs 'Փոխանակումով' (Exchange)
  // Assuming 54-57 are Win, and 58-59 are Exchange based on mapping duplicate values, 
  // or we just group them for now and ask user.
  let armTotalMoney = 0;
  let armTotalCount = 0;
  
  let armWinMoney = 0;
  let armWinCount = 0;

  let armExchangeMoney = 0;
  let armExchangeCount = 0;
  
  let armProvidedMoney = 0;

  armeniaData.forEach(d => {
    const pId = parseInt(d.prize_id, 10);
    if (pId >= 54 && pId <= 59) {
      const val = getPrizeValue(d.PrizeName);
      armTotalMoney += val;
      armTotalCount += 1;
      
      // Temporary assumption: 58 and 59 are exchanges
      if (pId === 58 || pId === 59) {
        armExchangeMoney += val;
        armExchangeCount += 1;
      } else {
        armWinMoney += val;
        armWinCount += 1;
      }
      
      const status = String(d.won_prize_status);
      if (status === '2' || status === '4') {
        armProvidedMoney += val;
      }
    }
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      
      {/* Template 1 */}
      <div className="glass-card" style={{ padding: '2rem' }}>
        <h3 style={{ marginTop: 0, marginBottom: '1.5rem', color: 'var(--accent-blue)' }}>Money Seeds - Georgia</h3>
        <div style={{ background: 'rgba(0,0,0,0.2)', padding: '1.5rem', borderRadius: '12px', fontFamily: 'monospace', fontSize: '1rem', lineHeight: '1.6', whiteSpace: 'pre-wrap' }}>
{`Վրաստան
Սքանավորումներ՝ ${geoTotalScans}, օգտատերեր՝ ${geoUniqueUsers}
Երեկ՝ +${geoYesterdayScans} սքանավորում, +${geoYesterdayUsers} օգտատեր
Շահումներ՝ 
10 Lari- ${geoWins10}
20 Lari- ${geoWins20}
50 Lari- ${geoWins50}`}
        </div>
        <button 
          onClick={() => navigator.clipboard.writeText(`Վրաստան\nՍքանավորումներ՝ ${geoTotalScans}, օգտատերեր՝ ${geoUniqueUsers}\nԵրեկ՝ +${geoYesterdayScans} սքանավորում, +${geoYesterdayUsers} օգտատեր\nՇահումներ՝\n10 Lari- ${geoWins10}\n20 Lari- ${geoWins20}\n50 Lari- ${geoWins50}`)}
          style={{ marginTop: '1rem', padding: '0.5rem 1rem', background: 'var(--accent-blue)', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer' }}
        >
          Copy to Clipboard
        </button>
      </div>

      {/* Template 2 */}
      <div className="glass-card" style={{ padding: '2rem' }}>
        <h3 style={{ marginTop: 0, marginBottom: '1.5rem', color: 'var(--accent-green)' }}>Money Seeds - Armenia</h3>
        <div style={{ background: 'rgba(0,0,0,0.2)', padding: '1.5rem', borderRadius: '12px', fontFamily: 'monospace', fontSize: '1rem', lineHeight: '1.6', whiteSpace: 'pre-wrap' }}>
{`Խանութպաններ

Ընդհանուր՝ ${armTotalScans} սքանավորում, ${armUniqueUsers} օգտատեր
Երեկ՝ +${armYesterdayScans} սքանավորում, +${armYesterdayUsers} օգտատեր

Ընդհանուր՝  ${armTotalMoney.toLocaleString('en-US')} դրամ | ${armTotalCount}  հատ, որից՝
Շահումով՝ ${armWinMoney.toLocaleString('en-US')} դրամի | ${armWinCount} հատ
Փոխանակումով՝ ${armExchangeMoney.toLocaleString('en-US')} դրամ | ${armExchangeCount} հատ

Ընդհանուր տրամադրել են՝ ${armProvidedMoney.toLocaleString('en-US')} դրամ`}
        </div>
        <button 
          onClick={() => navigator.clipboard.writeText(`Խանութպաններ\n\nԸնդհանուր՝ ${armTotalScans} սքանավորում, ${armUniqueUsers} օգտատեր\nԵրեկ՝ +${armYesterdayScans} սքանավորում, +${armYesterdayUsers} օգտատեր\n\nԸնդհանուր՝ ${armTotalMoney.toLocaleString('en-US')} դրամ | ${armTotalCount} հատ, որից՝\nՇահումով՝ ${armWinMoney.toLocaleString('en-US')} դրամի | ${armWinCount} հատ\nՓոխանակումով՝ ${armExchangeMoney.toLocaleString('en-US')} դրամ | ${armExchangeCount} հատ\n\nԸնդհանուր տրամադրել են՝ ${armProvidedMoney.toLocaleString('en-US')} դրամ`)}
          style={{ marginTop: '1rem', padding: '0.5rem 1rem', background: 'var(--accent-green)', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer' }}
        >
          Copy to Clipboard
        </button>
      </div>
    </div>
  );
};

export default Reports;
