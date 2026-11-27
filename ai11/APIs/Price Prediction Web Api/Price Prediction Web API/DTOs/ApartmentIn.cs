namespace Price_Prediction_Web_API.DTOs;

public class ApartmentIn
{
    public int Bedrooms { get; set; }
    public int Bathrooms { get; set; }
    public float Sqm { get; set; }
    public string City { get; set; } = string.Empty;
    public float PriceAZN { get; set; }
}
