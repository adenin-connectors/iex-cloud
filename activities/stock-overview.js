'use strict';

const api = require('./common/api');

module.exports = async (activity) => {
  try {
    api.initialize(activity);

    const symbol = activity.Context.connector.custom1;
    const token = activity.Context.connector.custom2;

    const promises = [];

    // Get the current stock quote
    promises.push(api(`/stock/${symbol}/quote?token=${token}`));

    // Get the stock symbol news list
    promises.push(api(`/stock/${symbol}/news/last/3?token=${token}`));

    // Get the stock history chart for current date (yesterday if trading is closed)
    promises.push(api(`/stock/${symbol}/intraday-prices?chartIEXOnly=true&token=${token}`));

    // Get the stock history chart for every required range
    promises.push(api(`/stock/${symbol}/chart/1m?chartCloseOnly=true&token=${token}`));
    promises.push(api(`/stock/${symbol}/chart/3m?chartCloseOnly=true&token=${token}`));
    promises.push(api(`/stock/${symbol}/chart/6m?chartCloseOnly=true&token=${token}`));
    promises.push(api(`/stock/${symbol}/chart/ytd?chartCloseOnly=true&token=${token}`));
    promises.push(api(`/stock/${symbol}/chart/1y?chartCloseOnly=true&token=${token}`));
    promises.push(api(`/stock/${symbol}/chart/5y?chartCloseOnly=true&token=${token}`));

    const responses = await Promise.all(promises);

    activity.Response.Data = {
      quote: {},
      news: {
        items: []
      },
      charts: {}
    };

    for (let i = 0; i < responses.length; i++) {
      const response = responses[i];

      // fail error
      if ($.isErrorResponse(activity, response)) return;

      // attach stock quote if quote response
      if (response.body.symbol) {
        activity.Response.Data.quote = response.body;
        activity.Response.Data.quote.date = new Date(response.body.latestUpdate);
      }

      // attach news array if news response
      if (Array.isArray(response.body) && response.body[0] && response.body[0].headline) {
        activity.Response.Data.news.items = convertNewsItems(response.body);
      }

      // construct and attach chart if history response
      if (Array.isArray(response.body) && response.body[0] && response.body[0].close) {
        // we know which chart it is from the position in the responses array
        switch (i) {
        // 1d
        case 2: {
          const oneDay = constructChart(response.body);

          activity.Response.Data.charts.current = oneDay;
          activity.Response.Data.charts.oneDay = oneDay;
          activity.Response.Data.charts.oneDay.show = true;
          break;
        }
        // 1m
        case 3:
          activity.Response.Data.charts.oneMonth = constructChart(response.body);
          activity.Response.Data.charts.oneMonth.show = false;
          break;
        // 3m
        case 4:
          activity.Response.Data.charts.threeMonth = constructChart(response.body);
          activity.Response.Data.charts.threeMonth.show = false;
          break;
        // 6m
        case 5:
          activity.Response.Data.charts.sixMonth = constructChart(response.body);
          activity.Response.Data.charts.sixMonth.show = false;
          break;
        // YTD
        case 6:
          activity.Response.Data.charts.yearToDate = constructChart(response.body);
          activity.Response.Data.charts.yearToDate.show = false;
          break;
        // 1y
        case 7:
          activity.Response.Data.charts.oneYear = constructChart(response.body);
          activity.Response.Data.charts.oneYear.show = false;
          break;
        // 5y
        case 8:
          activity.Response.Data.charts.fiveYear = constructChart(response.body);
          activity.Response.Data.charts.fiveYear.show = false;
          break;
        }
      }
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
    palette: 'office.Depth6',
    configuration: {
      data: {
        labels: labels,
        datasets: [{
          data: data,
          fill: false,
          pointRadius: 0,
          pointHitRadius: 10
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
              fontColor: '#838b8b'
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
                fontColor: '#838b8b'
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
