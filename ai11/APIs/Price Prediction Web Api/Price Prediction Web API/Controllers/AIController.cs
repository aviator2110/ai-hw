using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Price_Prediction_Web_API.DTOs;

namespace Price_Prediction_Web_API.Controllers;

[Route("api/[controller]")]
[ApiController]
public class AIController : ControllerBase
{
    private readonly HttpClient _httpClient;

    public AIController(IHttpClientFactory factory)
    {
        _httpClient = factory.CreateClient("ai");
    }

    [HttpPost]
    public async Task<IActionResult> Predict([FromBody] PredictIn predict)
    {
        var result = await _httpClient.PostAsJsonAsync("/predict", predict);

        if (!result.IsSuccessStatusCode)
        {
            return StatusCode((int)result.StatusCode, await result.Content.ReadAsStringAsync());
        }

        var prediction = await result.Content.ReadFromJsonAsync<PredictOut>();
        return Ok(prediction);
    }
}
