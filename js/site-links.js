export const graph = {
  "places": [
    {
      "id": "home",
      "title": "Home",
      "href": "/",
      "summary": "Software for trading, shipping and field service."
    },
    {
      "id": "stories",
      "title": "Stories",
      "href": "/stories/",
      "summary": "Four working days, and the choices behind them."
    },
    {
      "id": "the-offer",
      "title": "The offer",
      "href": "/stories/the-offer/",
      "summary": "The buyer asks in the chat they already use."
    },
    {
      "id": "the-job",
      "title": "The job",
      "href": "/stories/the-job/",
      "summary": "The office sees what the field already recorded."
    },
    {
      "id": "the-shipment",
      "title": "The shipment",
      "href": "/stories/the-shipment/",
      "summary": "The booking and the documents stay with the shipment."
    },
    {
      "id": "the-choices",
      "title": "The choices",
      "href": "/stories/the-choices/",
      "summary": "The work stays where it already happens."
    },
    {
      "id": "tradey",
      "title": "Tradey",
      "href": "/products/tradey/",
      "summary": "Offers drafted in the chat the buyer already uses."
    },
    {
      "id": "workslip",
      "title": "Workslip",
      "href": "/products/workslip/",
      "summary": "Field work recorded once and visible in the office."
    },
    {
      "id": "shippy",
      "title": "Shippy",
      "href": "/products/shippy/",
      "summary": "A shipment kept together for an independent forwarder."
    },
    {
      "id": "contact",
      "title": "Contact",
      "href": "/contact/",
      "summary": "Write to MR Software."
    },
    {
      "id": "integrations",
      "title": "Integrations",
      "href": "/integrations/",
      "summary": "The systems the products sit beside."
    },
    {
      "id": "roadmap",
      "title": "Roadmap",
      "href": "/roadmap/",
      "summary": "What is live, in demo, and still being built."
    }
  ],
  "links": {
    "the-offer": [
      {
        "id": "to:the-job",
        "toId": "the-job"
      },
      {
        "id": "to:the-shipment",
        "toId": "the-shipment"
      },
      {
        "id": "to:the-choices",
        "toId": "the-choices"
      },
      {
        "id": "to:tradey",
        "toId": "tradey"
      }
    ],
    "the-job": [
      {
        "id": "to:the-offer",
        "toId": "the-offer"
      },
      {
        "id": "to:workslip",
        "toId": "workslip"
      },
      {
        "id": "to:the-choices",
        "toId": "the-choices"
      }
    ],
    "the-shipment": [
      {
        "id": "to:the-offer",
        "toId": "the-offer"
      },
      {
        "id": "to:shippy",
        "toId": "shippy"
      },
      {
        "id": "to:the-choices",
        "toId": "the-choices"
      }
    ],
    "the-choices": [
      {
        "id": "to:the-offer",
        "toId": "the-offer"
      },
      {
        "id": "to:the-job",
        "toId": "the-job"
      },
      {
        "id": "to:the-shipment",
        "toId": "the-shipment"
      }
    ]
  }
}
;
