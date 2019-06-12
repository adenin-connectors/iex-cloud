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
    promises.push(api(`/stock/${symbol}/news?token=${token}`));

    // Get the stock history chart for current date (every 30 mins)
    promises.push(api(`/stock/${symbol}/intraday-prices?chartInterval=5&token=${token}`));

    // Get the stock history chart for past month
    promises.push(api(`/stock/${symbol}/chart/1m?token=${token}`));

    /*promises.push(api(`/stock/${symbol}/chart/3m?token=${token}`));

    promises.push(api(`/stock/${symbol}/chart/6m?token=${token}`));

    promises.push(api(`/stock/${symbol}/chart/ytd?token=${token}`));

    promises.push(api(`/stock/${symbol}/chart/1y?token=${token}`));

    promises.push(api(`/stock/${symbol}/chart/5y?token=${token}`));*/

    const responses = await Promise.all(promises);

    activity.Response.Data = {
      quote: {},
      news: {
        _page: 1,
        _pageSize: 99,
        items: []
      },
      chart: {}
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
      if (Array.isArray(response.body) && response.body[0].headline) {
        activity.Response.Data.news.items = convertNewsItems(response.body);
      }

      // construct and attach chart if history response
      if (Array.isArray(response.body) && response.body[0].close) {
        // If the response is intraday
        if (response.body[0].minute) {
          const date = new Date(response.body[0].date);
          const today = new Date();

          // only add the chart if it's today (stocks are open)
          if (date.getDate() === today.getDate()) {
            activity.Response.Data.chart = constructChart(response.body);
            break;
          }
        } else {
          // Use past month as chart when stocks aren't open
          activity.Response.Data.chart = constructChart(response.body);
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

    labels.push(day.label);
    data.push(day.close);
  }

  return {
    template: 'line',
    palette: 'office.Celestial6',
    configuration: {
      data: {
        labels: labels,
        datasets: [{
          data: data,
          fill: false
        }]
      },
      options: {
        legend: {
          display: false
        },
        scales: {
          yAxes: [{
            position: 'left',
            ticks: {
              beginAtZero: false
            }
          }]
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
