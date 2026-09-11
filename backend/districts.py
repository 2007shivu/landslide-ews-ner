"""Static monitoring-station metadata. No simulated sensor readings live here."""

NER_DISTRICTS = [
    {"id":"dima-hasao","name":"Dima Hasao","state":"Assam","lat":25.32,"lon":93.02,"slope_deg":34,"soil_type":2,"vegetation_cover_pct":55,"historical_landslide_freq":8},
    {"id":"east-khasi","name":"East Khasi Hills","state":"Meghalaya","lat":25.57,"lon":91.88,"slope_deg":38,"soil_type":2,"vegetation_cover_pct":48,"historical_landslide_freq":11},
    {"id":"w-jaintia","name":"West Jaintia Hills","state":"Meghalaya","lat":25.45,"lon":92.35,"slope_deg":31,"soil_type":1,"vegetation_cover_pct":52,"historical_landslide_freq":6},
    {"id":"sw-garo","name":"South West Garo Hills","state":"Meghalaya","lat":25.52,"lon":90.20,"slope_deg":27,"soil_type":1,"vegetation_cover_pct":60,"historical_landslide_freq":4},
    {"id":"aizawl","name":"Aizawl","state":"Mizoram","lat":23.73,"lon":92.72,"slope_deg":41,"soil_type":2,"vegetation_cover_pct":65,"historical_landslide_freq":9},
    {"id":"lunglei","name":"Lunglei","state":"Mizoram","lat":22.88,"lon":92.73,"slope_deg":36,"soil_type":1,"vegetation_cover_pct":62,"historical_landslide_freq":5},
    {"id":"ukhrul","name":"Ukhrul","state":"Manipur","lat":25.12,"lon":94.36,"slope_deg":33,"soil_type":1,"vegetation_cover_pct":58,"historical_landslide_freq":5},
    {"id":"senapati","name":"Senapati","state":"Manipur","lat":25.27,"lon":94.02,"slope_deg":29,"soil_type":1,"vegetation_cover_pct":55,"historical_landslide_freq":4},
    {"id":"kohima","name":"Kohima","state":"Nagaland","lat":25.67,"lon":94.11,"slope_deg":37,"soil_type":2,"vegetation_cover_pct":50,"historical_landslide_freq":7},
    {"id":"phek","name":"Phek","state":"Nagaland","lat":25.66,"lon":94.48,"slope_deg":32,"soil_type":1,"vegetation_cover_pct":57,"historical_landslide_freq":5},
    {"id":"gangtok","name":"East Sikkim","state":"Sikkim","lat":27.33,"lon":88.61,"slope_deg":44,"soil_type":2,"vegetation_cover_pct":45,"historical_landslide_freq":13},
    {"id":"mangan","name":"North Sikkim","state":"Sikkim","lat":27.51,"lon":88.53,"slope_deg":47,"soil_type":0,"vegetation_cover_pct":40,"historical_landslide_freq":10},
    {"id":"dhalai","name":"Dhalai","state":"Tripura","lat":24.05,"lon":91.90,"slope_deg":22,"soil_type":1,"vegetation_cover_pct":68,"historical_landslide_freq":2},
    {"id":"tawang","name":"Tawang","state":"Arunachal Pradesh","lat":27.59,"lon":91.87,"slope_deg":46,"soil_type":0,"vegetation_cover_pct":35,"historical_landslide_freq":9},
    {"id":"papum-pare","name":"Papum Pare","state":"Arunachal Pradesh","lat":27.10,"lon":93.62,"slope_deg":30,"soil_type":1,"vegetation_cover_pct":63,"historical_landslide_freq":4},
]

def find_district(district_id):
    return next((d for d in NER_DISTRICTS if d["id"] == district_id), None)
