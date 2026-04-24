const fbClient = require("../utils/fbClient");

exports.getAdsInsights = async (req, res) => {
    try {
        const response = await fbClient.get(
            `/v17.0/act_${390268725317115}/insights`,
            {
                params: {
                    fields:
                        "campaign_name,ad_name,impressions,reach,clicks,spend,cpc,cpm,ctr",
                    level: "ad",
                    time_increment: 1,
                    access_token: "EAANKDV86S6gBRMrqeSHAtcjZAt9JRcKhfjituzCt9ZCUoobNZCIgRT4bDqkZCpLZCeks83yJtBSxhZBdmNCza1evrqJGkKkWOnLPckLqG01Q5HcHmGxs8ZCFuyKerZAx1jG9W6tPq4RFQsAbU7tjznq4HpFJg0EckvGQnUcZCO23PdOFaq7BYynKbZCZBSYGgwl",
                    appsecret_proof: "b4e95a2fbc498da4f06af7f0bcce97f369401e1b87d57d21810867f40f977a77",
                },
            }
        );

        res.json(response.data.data);
    } catch (err) {
        res.status(500).json(err.response?.data || err.message);
    }
};