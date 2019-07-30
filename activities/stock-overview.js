'use strict';

const fs = require('fs');
const {promisify} = require('util');
const {sep} = require('path');

const exists = promisify(fs.exists);
const readFile = promisify(fs.readFile);
const writeFile = promisify(fs.writeFile);
const unlink = promisify(fs.unlink);

const api = require('./common/api');

module.exports = async (activity) => {
  try {
    api.initialize(activity);

    const cacheFolder = activity.Context.CacheFolder;
    const symbol = activity.Context.connector.custom1;
    const token = activity.Context.connector.custom2;

    activity.Response.Data = {
      quote: {},
      news: {
        items: []
      },
      charts: {}
    };

    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).length < 2 ? '0' + String(now.getMonth() + 1) : now.getMonth() + 1;
    const date = String(now.getDate()).length < 2 ? '0' + String(now.getDate()) : now.getDate();
    const hour = String(now.getHours()).length < 2 ? '0' + String(now.getHours()) : now.getHours();
    const minute = String(now.getMinutes()).length < 2 ? '0' + String(now.getMinutes()) : now.getMinutes();

    const perMinute = `${cacheFolder}${sep}${symbol}-${year}${month}${date}${hour}${minute}.json`;

    if (await exists(perMinute)) {
      const file = await readFile(perMinute);

      activity.Response.Data = JSON.parse(file);
    } else {
      const promises = [];

      promises.push(api(`/stock/${symbol}/quote?token=${token}`));
      promises.push(api(`/stock/${symbol}/news/last/3?token=${token}`));
      promises.push(api(`/stock/${symbol}/intraday-prices?chartIEXOnly=true&token=${token}`));

      const responses = await Promise.all(promises);

      for (let i = 0; i < responses.length; i++) {
        const response = responses[i];

        if ($.isErrorResponse(activity, response)) return;

        if (response.body.symbol) {
          const quote = response.body;

          if (quote.latestPrice) quote.latestPrice = quote.latestPrice.toFixed(2);
          if (quote.change) quote.change = quote.change.toFixed(2);
          if (quote.changePercent) quote.changePercent = quote.changePercent.toFixed(2);
          if (quote.extendedChange) quote.extendedChange = quote.extendedChange.toFixed(2);
          if (quote.extendedChangePercent) quote.extendedChangePercent = quote.extendedChangePercent.toFixed(2);

          quote.date = new Date(response.body.latestUpdate);

          activity.Response.Data.quote = quote;
        }

        if (Array.isArray(response.body) && response.body[0] && response.body[0].headline) {
          activity.Response.Data.news.items = convertNewsItems(response.body);
        }

        if (Array.isArray(response.body) && response.body[0] && response.body[0].close) {
          const oneDay = constructChart(response.body);

          activity.Response.Data.charts.current = oneDay;
          activity.Response.Data.charts.oneDay = oneDay;
          activity.Response.Data.charts.oneDay.show = true;
          activity.Response.Data.charts.initialKey = 'oneDay';
        }
      }

      const data = JSON.stringify(activity.Response.Data);

      // check it hasn't been written
      if (!await exists(perMinute)) {
        try {
          await writeFile(perMinute, data);
        } catch (error) { /* may have just been written, in which case do nothing */ }
      }

      // we keep 3 recent files, delete 3 mins ago
      const now = new Date(`${year}-${month}-${date}T${hour}:${minute}:00`);
      const old = new Date(now);

      old.setMinutes(now.getMinutes() - 3);

      const oldYear = old.getFullYear();
      const oldMonth = String(old.getMonth() + 1).length < 2 ? '0' + String(old.getMonth() + 1) : old.getMonth() + 1;
      const oldDate = String(old.getDate()).length < 2 ? '0' + String(old.getDate()) : old.getDate();
      const oldHour = String(old.getHours()).length < 2 ? '0' + String(old.getHours()) : old.getHours();
      const oldMinute = String(old.getMinutes()).length < 2 ? '0' + String(old.getMinutes()) : old.getMinutes();

      const oldFile = `${cacheFolder}${sep}${symbol}-${oldYear}${oldMonth}${oldDate}${oldHour}${oldMinute}.json`;

      // check it actually exists
      if (await exists(oldFile)) {
        try {
          await unlink(oldFile);
        } catch (error) { /* may have just been deleted, in which case do nothing */ }
      }
    }

    const perDay = `${cacheFolder}${sep}${symbol}-YTD-${year}${month}${date}.json`;

    if (await exists(perDay)) {
      const file = await readFile(perDay);
      const data = JSON.parse(file);

      activity.Response.Data.charts.oneMonth = data.oneMonth;
      activity.Response.Data.charts.threeMonth = data.threeMonth;
      activity.Response.Data.charts.sixMonth = data.sixMonth;
      activity.Response.Data.charts.yearToDate = data.yearToDate;
      activity.Response.Data.charts.oneYear = data.oneYear;
      activity.Response.Data.charts.fiveYear = data.fiveYear;
    } else {
      const promises = [];

      promises.push(api(`/stock/${symbol}/chart/1m?chartCloseOnly=true&token=${token}`));
      promises.push(api(`/stock/${symbol}/chart/3m?chartCloseOnly=true&token=${token}`));
      promises.push(api(`/stock/${symbol}/chart/6m?chartCloseOnly=true&token=${token}`));
      promises.push(api(`/stock/${symbol}/chart/ytd?chartCloseOnly=true&token=${token}`));
      promises.push(api(`/stock/${symbol}/chart/1y?chartCloseOnly=true&token=${token}`));
      promises.push(api(`/stock/${symbol}/chart/5y?chartCloseOnly=true&token=${token}`));

      const responses = await Promise.all(promises);

      for (let i = 0; i < responses.length; i++) {
        const response = responses[i];

        if ($.isErrorResponse(activity, response)) return;

        if (Array.isArray(response.body) && response.body[0] && response.body[0].close) {
          switch (i) {
          // 1m
          case 0:
            activity.Response.Data.charts.oneMonth = constructChart(response.body);
            activity.Response.Data.charts.oneMonth.show = false;
            break;
          // 3m
          case 1:
            activity.Response.Data.charts.threeMonth = constructChart(response.body);
            activity.Response.Data.charts.threeMonth.show = false;
            break;
          // 6m
          case 2:
            activity.Response.Data.charts.sixMonth = constructChart(response.body);
            activity.Response.Data.charts.sixMonth.show = false;
            break;
          // YTD
          case 3:
            activity.Response.Data.charts.yearToDate = constructChart(response.body);
            activity.Response.Data.charts.yearToDate.show = false;
            break;
          // 1y
          case 4:
            activity.Response.Data.charts.oneYear = constructChart(response.body);
            activity.Response.Data.charts.oneYear.show = false;
            break;
          // 5y
          case 5:
            activity.Response.Data.charts.fiveYear = constructChart(response.body);
            activity.Response.Data.charts.fiveYear.show = false;
            break;
          }
        }
      }

      // strip out the charts that may have come from first request, they don't need caching again
      const historicalCharts = {
        oneMonth: activity.Response.Data.charts.oneMonth,
        threeMonth: activity.Response.Data.charts.threeMonth,
        sixMonth: activity.Response.Data.charts.sixMonth,
        yearToDate: activity.Response.Data.charts.yearToDate,
        oneYear: activity.Response.Data.charts.oneYear,
        fiveYear: activity.Response.Data.charts.fiveYear
      };

      const data = JSON.stringify(historicalCharts);

      // check it hasn't already been written
      if (!await exists(perDay)) {
        try {
          await writeFile(perDay, data);
        } catch (error) { /* might have just been written, in which case ignore */ }
      }

      // we keep 3 recent files, delete 3 days ago
      const now = new Date(`${year}-${month}-${date}T${hour}:${minute}:00`);
      const old = new Date(now);

      old.setDate(now.getDate() - 3);

      const oldYear = old.getFullYear();
      const oldMonth = String(old.getMonth() + 1).length < 2 ? '0' + String(old.getMonth() + 1) : old.getMonth() + 1;
      const oldDate = String(old.getDate()).length < 2 ? '0' + String(old.getDate()) : old.getDate();

      const oldFile = `${cacheFolder}${sep}${symbol}-YTD-${oldYear}${oldMonth}${oldDate}.json`;

      // check it actually exists
      if (await exists(oldFile)) {
        try {
          await unlink(oldFile);
        } catch (error) { /* may have just been deleted, in which case ignore */ }
      }
    }

    // handle when there's no intraday
    if (!activity.Response.Data.charts.oneDay) {
      activity.Response.Data.charts.current = activity.Response.Data.charts.oneMonth;
      activity.Response.Data.charts.oneMonth.show = true;
      activity.Response.Data.charts.initialKey = 'oneMonth';
    }

    if (activity.Request.Data.args && activity.Request.Data.args.selected) {
      if (activity.Response.Data.charts.oneDay) activity.Response.Data.charts.oneDay.show = false;

      activity.Response.Data.charts.oneMonth.show = false;

      activity.Response.Data.charts.current = activity.Response.Data.charts[activity.Request.Data.args.selected];
      activity.Response.Data.charts[activity.Request.Data.args.selected].show = true;
      activity.Response.Data.charts.initialKey = activity.Request.Data.args.selected;
    }
  } catch (error) {
    $.handleError(activity, error);
  }
};

function constructChart(history) {
  const labels = [];
  const data = [];

  for (let i = 0; i < history.length; i++) {
    const day = history[i];
    let label = day.label;

    if (!label) {
      const today = (new Date(day.date)).toString().split(' ');
      label = `${today[1]} ${today[2]}`;
    }

    labels.push(label);
    data.push(day.close);
  }

  return {
    template: 'line',
    dimensions: {
      width: 400,
      height: 225
    },
    configuration: {
      data: {
        labels: labels,
        datasets: [{
          data: data,
          fill: false,
          pointRadius: 0,
          pointHitRadius: 10,
          borderColor: 'rgba(20, 167, 146, 1)',
          pointBackgroundColor: 'rgba(20, 167, 146, 1)',
          pointBorderColor: 'rgba(20, 167, 146, 1)',
          spanGaps: true
        }]
      },
      options: {
        legend: {
          display: false
        },
        layout: {
          padding: {
            left: 15,
            right: 35,
            top: 5,
            bottom: 25
          }
        },
        scales: {
          yAxes: [{
            position: 'left',
            ticks: {
              beginAtZero: false,
              maxTicksLimit: 3,
              padding: 25,
              fontColor: '#9b9b9b'
            },
            gridLines: {
              drawBorder: false,
              borderDash: [8, 8]
            }
          }],
          xAxes: [
            {
              position: 'bottom',
              display: false
            },
            {
              position: 'top',
              ticks: {
                display: true,
                maxRotation: 0,
                maxTicksLimit: 3,
                padding: 10,
                fontColor: '#9b9b9b'
              },
              gridLines: {
                display: false,
                drawBorder: false
              }
            }
          ]
        }
      }
    }
  };
}

function convertNewsItems(items) {
  const results = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];

    results.push({
      title: item.headline,
      description: item.summary,
      link: item.url,
      date: new Date(item.datetime),
      thumbnail: item.image,
      source: item.source,
      lang: item.lang,
      hasPaywall: item.hasPaywall
    });
  }

  return results;
}
